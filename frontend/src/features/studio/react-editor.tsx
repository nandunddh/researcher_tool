"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { componentCatalog } from "./component-catalog";
import { instantiateComponent } from "./component-instance";
import type { Section } from "./document";
import { dropSection, editorPayload, findElement, insertSection, prepareSite, updateElement, type EditorSite, type Selection } from "./editor-model";
import { Inspector, elementName, type Change } from "./inspector";
import { getElements, type Viewport } from "./site-schema";
import { SiteRenderer } from "./site-renderer";
import styles from "./react-editor.module.css";

type State = { site: EditorSite | null; past: EditorSite[]; future: EditorSite[]; dirty: boolean; lastKey?: string; lastAt: number; error: string };
type Action =
  | { type: "load"; site: EditorSite }
  | { type: "apply"; fn: (site: EditorSite) => EditorSite; key?: string }
  | { type: "undo" } | { type: "redo" }
  | { type: "error"; message: string };

const HISTORY = 100;
const COALESCE_MS = 1200;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load": return { site: action.site, past: [], future: [], dirty: false, lastAt: 0, error: "" };
    case "error": return { ...state, error: action.message };
    case "apply": {
      if (!state.site) return state;
      let next: EditorSite;
      try { next = action.fn(state.site); }
      catch (e) { return { ...state, error: e instanceof Error ? e.message : "That change could not be made." }; }
      if (next === state.site) return state;
      const now = Date.now();
      const merge = !!action.key && action.key === state.lastKey && now - state.lastAt < COALESCE_MS;
      return {
        ...state, site: next, future: [], dirty: true, lastKey: action.key, lastAt: now, error: "",
        past: merge ? state.past : [...state.past.slice(-(HISTORY - 1)), state.site],
      };
    }
    case "undo": {
      if (!state.site || !state.past.length) return state;
      return { ...state, site: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.site, ...state.future], dirty: true, lastKey: undefined };
    }
    case "redo": {
      if (!state.site || !state.future.length) return state;
      return { ...state, site: state.future[0], future: state.future.slice(1), past: [...state.past, state.site], dirty: true, lastKey: undefined };
    }
  }
}

const widths: Record<Viewport, number> = { desktop: 1440, tablet: 768, mobile: 390 };

/** Renders the page at the real screen width and scales it down to fit the canvas,
 *  so a "Desktop" preview on a laptop still uses desktop styles. */
function ScaledSheet({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const scale = Math.min(1, o.clientWidth / width);
      setBox({ scale, height: i.offsetHeight * scale });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(o);
    observer.observe(i);
    measure();
    return () => observer.disconnect();
  }, [width]);
  return (
    <div ref={outer} className={styles.sheetFrame} style={{ height: box.height || undefined }}>
      <div ref={inner} className={styles.sheet} data-scaled={box.scale < 1 || undefined}
        style={{ width, transform: box.scale < 1 ? `scale(${box.scale})` : undefined }}>
        {children}
      </div>
      {box.scale < 1 && <span className={styles.zoom}>{Math.round(box.scale * 100)}%</span>}
    </div>
  );
}
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function ReactEditor({ siteId, namespace }: { siteId: string; namespace: string }) {
  const [state, dispatch] = useReducer(reducer, { site: null, past: [], future: [], dirty: false, lastAt: 0, error: "" });
  const { site, dirty, error } = state;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"live" | "saved">("live");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [layersOpen, setLayersOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [announcement, announce] = useState("");
  const endpoint = `/api/builder/sites/${encodeURIComponent(siteId)}`;
  const readOnly = busy || site?.status === "published";

  const change: Change = useCallback((fn, key) => { if (!readOnly) dispatch({ type: "apply", fn, key }); }, [readOnly]);
  const showError = useCallback((message: string) => dispatch({ type: "error", message }), []);

  useEffect(() => {
    const abort = new AbortController();
    api<EditorSite>(endpoint, { signal: abort.signal })
      .then(raw => {
        const prepared = prepareSite(raw);
        dispatch({ type: "load", site: prepared });
        const first = prepared.schema_json.find(s => getElements(s));
        if (first) setSelection({ sectionId: first.id });
      })
      .catch(e => { if (!abort.signal.aborted) showError(e.message); });
    return () => abort.abort();
  }, [endpoint, showError]);

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); dispatch({ type: e.shiftKey ? "redo" : "undo" }); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); dispatch({ type: "redo" }); }
      else if (e.key === "Escape") setSelection(s => (s?.elementId ? { sectionId: s.sectionId } : s));
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);

  // Drop the selection if undo/redo removed the selected section or item.
  useEffect(() => {
    if (!site || !selection) return;
    const { section, element } = findElement(site, selection);
    if (!section) setSelection(null);
    else if (selection.elementId && !element) setSelection({ sectionId: section.id });
  }, [site, selection]);

  async function save() {
    if (!site) return;
    setBusy(true);
    try {
      await api(endpoint, { method: "PUT", body: JSON.stringify(editorPayload(site)) });
      const saved = prepareSite(await api<EditorSite>(endpoint));
      dispatch({ type: "load", site: saved });
      setRevision(v => v + 1);
      announce("All changes saved");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function add(id: string) {
    if (!site || readOnly) return;
    const item = componentCatalog.find(c => c.id === id);
    if (!item) return;
    const section = { ...instantiateComponent(item, site.name), title: item.category === "Navigation" ? "Navigation bar" : item.category === "Hero" ? "Hero" : item.name } as Section;
    change(s => insertSection(s, section, selection?.sectionId));
    setSelection({ sectionId: section.id });
    setView("live");
    announce(`${item.name} added`);
  }

  function drop(target: string) {
    if (dragging && !readOnly) { change(s => dropSection(s, dragging, target)); announce("Section order updated"); }
    setDragging(null);
    setDropTarget(null);
  }

  const status = busy ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved";
  return (
    <main className={styles.editor}>
      <header className={styles.toolbar}>
        <a href={`/${namespace}/scistudio`} onClick={e => { if (dirty && !confirm("You have unsaved changes. Leave without saving?")) e.preventDefault(); }}>← All websites</a>
        <strong>{site?.name || "Website editor"}</strong>
        <div className={styles.toolGroup} role="group" aria-label="History">
          <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={busy || !state.past.length} title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={busy || !state.future.length} title="Redo (Ctrl+Shift+Z)">Redo</button>
        </div>
        <div className={styles.toolGroup} role="group" aria-label="View">
          <button type="button" aria-pressed={view === "live"} onClick={() => setView("live")}>Edit</button>
          <button type="button" aria-pressed={view === "saved"} onClick={() => setView("saved")}>Saved preview</button>
        </div>
        <div className={styles.toolGroup} role="group" aria-label="Screen size">
          {(["desktop", "tablet", "mobile"] as const).map(v => (
            <button key={v} type="button" aria-pressed={viewport === v} onClick={() => setViewport(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <div className={styles.toolGroup} role="group" aria-label="Panels">
          <button type="button" aria-pressed={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>Layers</button>
          <button type="button" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}>Inspector</button>
        </div>
        <span role="status" className={styles.status} data-dirty={dirty || undefined}>{status}</span>
        <a className={styles.classic} href={`/${namespace}/scistudio/${encodeURIComponent(siteId)}/edit`}
          onClick={e => { if (dirty) { e.preventDefault(); showError("Save your changes before opening the classic editor."); } }}>Classic editor</a>
        <button type="button" className={styles.save} disabled={!site || readOnly || !dirty} onClick={() => void save()}>Save</button>
      </header>

      {error && <p role="alert" className={styles.alert}>{error}<button type="button" onClick={() => showError("")} aria-label="Dismiss message">×</button></p>}
      {site?.status === "published" && <p className={styles.notice}>This website is published, so editing is locked.</p>}

      {!site ? (!error && <p role="status" className={styles.notice}>Opening website…</p>) : (
        <div className={styles.workspace} data-layers={layersOpen} data-inspector={inspectorOpen}>
          <aside className={styles.layers} hidden={!layersOpen}>
            <h2>Layers</h2>
            <div className={styles.buttonRow}>
              <button type="button" disabled={readOnly} onClick={() => add("nav-classic")}>+ Navigation</button>
              <button type="button" disabled={readOnly} onClick={() => add("hero-split")}>+ Hero</button>
            </div>
            <p className={styles.hint}>Drag a section onto another to place it above.</p>
            <span role="status" className={styles.announce}>{announcement}</span>
            <ul className={styles.layerList}>
              {site.schema_json.map(s => {
                const elements = getElements(s);
                const open = selection?.sectionId === s.id;
                return (
                  <li key={s.id}>
                    <button type="button" draggable={!readOnly} data-drop-target={dropTarget === s.id || undefined}
                      aria-pressed={open && !selection?.elementId} aria-expanded={elements ? open : undefined}
                      onDragStart={e => { setDragging(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
                      onDragOver={e => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropTarget(s.id); } }}
                      onDrop={e => { e.preventDefault(); drop(s.id); }}
                      onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                      onClick={() => setSelection({ sectionId: s.id })}>
                      {s.title || s.type}{!elements && <small> · classic</small>}
                    </button>
                    {open && elements && (
                      <ul>
                        {elements.map(e => (
                          <li key={e.id}><button type="button" aria-pressed={selection?.elementId === e.id}
                            onClick={() => setSelection({ sectionId: s.id, elementId: e.id })}>{elementName(e)}</button></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>

          {view === "live" ? (
            <div className={styles.canvas} onClick={e => { if (e.target === e.currentTarget) setSelection(null); }}>
              <ScaledSheet width={widths[viewport]}>
                {!site.schema_json.length && (
                  <div className={styles.empty}>
                    <h2>Your page is empty</h2>
                    <p>Start with a navigation bar and a hero. You can change everything afterwards.</p>
                    <div className={styles.buttonRow}>
                      <button type="button" disabled={readOnly} onClick={() => add("nav-classic")}>+ Navigation bar</button>
                      <button type="button" disabled={readOnly} onClick={() => add("hero-split")}>+ Hero</button>
                    </div>
                  </div>
                )}
                <SiteRenderer sections={site.schema_json} pages={site.pages} siteSlug={site.slug} edit={{
                  selection, readOnly, dragging,
                  onSelect: sel => { setSelection(sel); setInspectorOpen(true); },
                  onText: (sectionId, elementId, text) => change(s => updateElement(s, sectionId, elementId, { text })),
                  onDropSection: drop,
                }} />
              </ScaledSheet>
            </div>
          ) : (
            <div className={styles.preview}>
              <iframe title="Saved website preview" style={{ maxWidth: widths[viewport] }} key={revision}
                src={`${endpoint}/preview?revision=${revision}`} sandbox="allow-scripts" />
            </div>
          )}

          <aside className={styles.inspector} hidden={!inspectorOpen}>
            <Inspector site={site} selection={selection} viewport={viewport} readOnly={readOnly}
              change={change} onSelect={setSelection} onError={showError} />
          </aside>
        </div>
      )}
    </main>
  );
}
