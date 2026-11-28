"use client";
import { editFormFields } from "./form-palette";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/icon";
import { componentCatalog, type LibraryComponent } from "./component-catalog";
import { instantiateComponent } from "./component-instance";
import type { Section } from "./document";
import { contentSignature, moveSection, removeSection, switchPage, dropSection, editorPayload, findElement, insertSection, prepareSite, updateElement, type EditorSite, type Selection } from "./editor-model";
import { ComponentsPanel } from "./components-panel";
import { PagesPanel } from "./pages-panel";
import { ComponentLibrary } from "./component-library";
import { ThemePanel } from "./theme-panel";
import { updateTheme } from "./studio-theme";
import { SiteSettings } from "./site-settings";
import { EventDetailsDialog, OPEN_EVENT, eventOf, sampleEvent } from "./event-details";
import { SubmissionsInbox } from "./submissions-inbox";
import { QuickToolbar } from "./quick-toolbar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Inspector, elementName, type Change, type ConfirmRequest } from "./inspector";
import { libraryFallback } from "./library-fallback";
import { getElements, needsKeyMigration, type Viewport } from "./site-schema";
import { SiteRenderer } from "./site-renderer";
import { hasBlock } from "./section-blocks";
import styles from "./react-editor.module.css";

type State = { site: EditorSite | null; past: EditorSite[]; future: EditorSite[]; saved: EditorSite | null; lastKey?: string; lastAt: number; error: string };
type Action =
  | { type: "load"; site: EditorSite; unsaved?: boolean }
  | { type: "apply"; fn: (site: EditorSite) => EditorSite; key?: string }
  | { type: "undo" } | { type: "redo" }
  | { type: "error"; message: string };

const HISTORY = 100;
const COALESCE_MS = 1200;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    // `unsaved` marks a site whose stored format was upgraded on load and needs saving.
    case "load": return { site: action.site, past: [], future: [], saved: action.unsaved ? null : action.site, lastAt: 0, error: "" };
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
        ...state, site: next, future: [], lastKey: action.key, lastAt: now, error: "",
        past: merge ? state.past : [...state.past.slice(-(HISTORY - 1)), state.site],
      };
    }
    case "undo": {
      if (!state.site || !state.past.length) return state;
      return { ...state, site: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.site, ...state.future], lastKey: undefined };
    }
    case "redo": {
      if (!state.site || !state.future.length) return state;
      return { ...state, site: state.future[0], future: state.future.slice(1), past: [...state.past, state.site], lastKey: undefined };
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
  const [state, dispatch] = useReducer(reducer, { site: null, past: [], future: [], saved: null, lastAt: 0, error: "" });
  const { site, error } = state;
  // Switching pages changes which page is open, not the content, so compare content.
  const dirty = useMemo(() => !!site && site !== state.saved && (!state.saved || contentSignature(site) !== contentSignature(state.saved)), [site, state.saved]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [layersOpen, setLayersOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<"add" | "layers" | "pages" | "theme">("layers");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [announcement, announce] = useState("");
  const [confirmRequest, ask] = useState<ConfirmRequest | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const leaving = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eventTab, setEventTab] = useState<string | null>(null);
  useEffect(() => {
    const open = (e: Event) => setEventTab(typeof (e as CustomEvent).detail === "string" ? (e as CustomEvent).detail : "basics");
    window.addEventListener(OPEN_EVENT, open);
    const fromCard = new URLSearchParams(window.location.search).get("event");  // "Event details" on a site card
    if (fromCard) setEventTab(fromCard);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  const [inboxOpen, setInboxOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try { if (localStorage.getItem("scistudio-editor-theme") === "dark") setTheme("dark"); } catch { /* storage unavailable */ }
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("scistudio-editor-theme", next); } catch { /* storage unavailable */ }
  }
  const endpoint = `/api/builder/sites/${encodeURIComponent(siteId)}`;
  const readOnly = busy;
  const live = site?.status === "published";

  const change: Change = useCallback((fn, key) => { if (!readOnly) dispatch({ type: "apply", fn, key }); }, [readOnly]);
  const showError = useCallback((message: string) => dispatch({ type: "error", message }), []);

  useEffect(() => {
    const abort = new AbortController();
    api<EditorSite>(endpoint, { signal: abort.signal })
      .then(raw => {
        const prepared = prepareSite(raw);
        const upgraded = Array.isArray(raw.schema_json) && raw.schema_json.some(needsKeyMigration);
        dispatch({ type: "load", site: prepared, unsaved: upgraded });
        if (upgraded) announce("This website was updated to the latest format. Save to finish.");
        const first = prepared.schema_json.find(s => getElements(s));
        if (first) setSelection({ sectionId: first.id });
        if (!prepared.schema_json.length) setLeftTab("add");
      })
      .catch(e => { if (!abort.signal.aborted) showError(e.message); });
    return () => abort.abort();
  }, [endpoint, showError]);

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirty && !leaving.current) { e.preventDefault(); e.returnValue = ""; } };
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

  async function save(): Promise<boolean> {
    if (!site) return false;
    setBusy(true);
    try {
      await api(endpoint, { method: "PUT", body: JSON.stringify(editorPayload(site)) });
      const saved = prepareSite(await api<EditorSite>(endpoint));
      dispatch({ type: "load", site: saved });
      announce("All changes saved");
      return true;
    } catch (e) {
      showError(e instanceof Error ? e.message : "Save failed. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Adds a library design below the selected section, or before `beforeId` when dropped on the canvas (null = end). */
  function add(item: LibraryComponent | undefined, beforeId?: string | null) {
    if (!site || readOnly || !item) return;
    const title = item.category === "Navigation" && !item.variant.startsWith("modern-") ? "Navigation bar" : item.variant === "hero" ? "Hero" : item.name;
    const section = { ...instantiateComponent(item, site.name), title } as Section;
    change(s => {
      // The first registration form gets sample tickets and prices, so it works straight away.
      const event = eventOf(s), sample = sampleEvent(s.name);
      const ready = section.type === "registration" && !event.tickets?.length
        ? { ...s, event: { ...sample, ...event, tickets: sample.tickets, periods: event.periods?.length ? event.periods : sample.periods } } : s;
      if (beforeId === undefined) return insertSection(ready, section, selection?.sectionId);
      const added = insertSection(ready, section);
      return beforeId ? dropSection(added, section.id, beforeId) : added;
    });
    setSelection({ sectionId: section.id });
    announce(`${item.name} added`);
  }
  const addById = (id: string) => add(componentCatalog.find(c => c.id === id));

  function drop(target: string) {
    if (dragging && !readOnly) {
      change(s => target === "__end" ? moveSection(s, dragging, s.schema_json.length - 1 - s.schema_json.findIndex(x => x.id === dragging)) : dropSection(s, dragging, target));
      announce("Section order updated");
    }
    setDragging(null);
    setDropTarget(null);
  }

  const renderPreserved = useMemo(() => libraryFallback(site?.name), [site?.name]);

  // Preview opens the saved website on its own page (same renderer as the canvas).
  const openPage = site?.pages?.find(pg => pg.id === site.active_page_id);
  const openSlug = openPage && !openPage.is_home ? (openPage.slug || "").replace(/^\/+|\/+$/g, "") : "";
  const previewUrl = `/scistudio/${encodeURIComponent(siteId)}/preview${openSlug ? `/${encodeURIComponent(openSlug)}` : ""}`;
  async function setLive(on: boolean) {
    if (!site) return;
    if (on && dirty && !(await save())) return;
    setBusy(true);
    try {
      await api(`${endpoint}/${on ? "publish" : "unpublish"}`, { method: "POST" });
      dispatch({ type: "load", site: prepareSite(await api<EditorSite>(endpoint)) });
      announce(on ? "Your website is live" : "Your website is offline");
    } catch (e) {
      showError(e instanceof Error ? e.message : "The website status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  function openPreview() {
    if (!dirty) { window.open(previewUrl, "_blank", "noopener"); return; }
    ask({
      title: "Save before previewing?",
      description: "The preview page shows your saved website. Save your changes now so you can see them there.",
      label: "Save and preview",
      run: () => {
        const tab = window.open("about:blank", "_blank"); // opened during the click so it is not blocked
        if (tab) tab.opener = null;
        void save().then(ok => { if (ok && tab) tab.location.href = previewUrl; else tab?.close(); });
      },
    });
  }

  const status = busy ? "Saving…" : dirty ? "Unsaved changes" : "Saved";
  const screens: [Viewport, string][] = [["desktop", "Desktop"], ["tablet", "Tablet"], ["mobile", "Mobile"]];
  return (
    <main className={styles.editor} data-theme={theme}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarStart}>
          <a className={styles.back} href="/scistudio" title="All websites" aria-label="All websites"
            onClick={e => {
              if (!dirty) return;
              e.preventDefault();
              const href = e.currentTarget.href;
              ask({
                title: "Leave without saving?",
                description: "You have unsaved changes. If you leave now, they will be lost.",
                label: "Leave without saving",
                // Already confirmed in our popup: skip the browser's own "Leave site?" check.
                run: () => { leaving.current = true; window.location.assign(href); },
              });
            }}>
            <Icon name="arrow" size={16} />
          </a>
          <div className={styles.siteName}>
            <strong>{site?.name || "Website editor"}</strong>
            <span role="status" className={styles.status} data-dirty={dirty || undefined}>
              <i aria-hidden="true" />{status}
            </span>
          </div>
        </div>

        <div className={styles.toolbarCenter}>
          {site && (site.pages?.length ?? 0) > 1 && (
            <label className={styles.pagePicker} title="Choose which page to edit">
              <Icon name="doc" size={14} />
              <select aria-label="Page being edited" value={site.active_page_id} onChange={e => change(s => switchPage(s, e.target.value))}>
                {site.pages!.map(pg => <option key={pg.id} value={pg.id}>{pg.name || "Untitled page"}</option>)}
              </select>
            </label>
          )}
          <button type="button" className={styles.addPrimary} disabled={!site || readOnly} onClick={() => setLibraryOpen(true)}
            title="Browse all section designs and add one to your page">
            <Icon name="plus" size={15} /> Add section
          </button>
          <div className={styles.segment} role="group" aria-label="Mode">
            <button type="button" onClick={openPreview} title="Open the saved website in a new tab"><Icon name="eye" size={14} /> Preview <Icon name="external" size={12} /></button>
          </div>
          <div className={styles.segment} role="group" aria-label="Screen size">
            {screens.map(([v, label]) => (
              <button key={v} type="button" aria-pressed={viewport === v} onClick={() => setViewport(v)} title={label} aria-label={label}>
                <Icon name={v} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.toolbarEnd}>
          <button type="button" className={styles.iconButton} onClick={() => dispatch({ type: "undo" })} disabled={busy || !state.past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon name="undo" size={16} /></button>
          <button type="button" className={styles.iconButton} onClick={() => dispatch({ type: "redo" })} disabled={busy || !state.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Icon name="redo" size={16} /></button>
          <button type="button" className={styles.iconButton} aria-pressed={layersOpen} onClick={() => setLayersOpen(!layersOpen)} title="Left panel" aria-label="Left panel"><Icon name="panel" size={16} /></button>
          <button type="button" className={styles.iconButton} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)} title="Inspector" aria-label="Inspector"><Icon name="layers" size={16} /></button>
          <button type="button" className={styles.settingsButton} disabled={!site} onClick={() => setEventTab("basics")} title="Dates, tickets, prices, discount codes and speakers, in one place">
            <Icon name="grid" size={15} /> Event details
          </button>
          <button type="button" className={styles.settingsButton} disabled={!site} onClick={() => setInboxOpen(true)} title="Messages and registrations sent from your forms">
            <Icon name="doc" size={15} /> Inbox
          </button>
          <button type="button" className={styles.settingsButton} disabled={!site} onClick={() => setSettingsOpen(true)}
            title="Search (SEO), social sharing and Google Analytics">
            <Icon name="settings" size={15} /> SEO &amp; settings
          </button>
          <button type="button" className={styles.iconButton} onClick={toggleTheme}
            title={theme === "light" ? "Switch to dark appearance" : "Switch to light appearance"}
            aria-label={theme === "light" ? "Switch to dark appearance" : "Switch to light appearance"}>
            <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
          </button>
          {site && (live ? <>
            <a className={styles.settingsButton} href={`/sites/${encodeURIComponent(site.slug ?? "")}`} target="_blank" rel="noopener noreferrer" title="Open your live website">
              <span aria-hidden="true" style={{ color: "#12b76a" }}>●</span> Live
            </a>
            <button type="button" className={styles.settingsButton} disabled={busy} onClick={() => ask({
              title: "Take your website offline?", label: "Unpublish",
              description: "Visitors will see a “not available” page until you publish again. Your content is kept.",
              run: () => void setLive(false),
            })}>Unpublish</button>
          </> : (
            <button type="button" className={styles.settingsButton} disabled={busy} onClick={() => void setLive(true)} title="Make your website visible to everyone">
              <Icon name="external" size={15} /> Publish
            </button>
          ))}
          <button type="button" className={styles.save} disabled={!site || readOnly || !dirty} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {error && <p role="alert" className={styles.alert}>{error}<button type="button" onClick={() => showError("")} aria-label="Dismiss message"><Icon name="close" size={14} /></button></p>}
      {live && <p className={styles.notice}>Your website is live. Saved changes appear on it right away.</p>}

      {!site ? (!error && <p role="status" className={styles.loading}>Opening website…</p>) : (
        <div className={styles.workspace} data-layers={layersOpen} data-inspector={inspectorOpen}>
          <aside className={styles.layers} hidden={!layersOpen}>
            <div className={styles.panelTabs} role="tablist" aria-label="Left panel">
              <button type="button" role="tab" aria-selected={leftTab === "add"} onClick={() => setLeftTab("add")}><Icon name="plus" size={15} /> Add</button>
              <button type="button" role="tab" aria-selected={leftTab === "layers"} onClick={() => setLeftTab("layers")}><Icon name="layers" size={15} /> Layers</button>
              <button type="button" role="tab" aria-selected={leftTab === "pages"} onClick={() => setLeftTab("pages")}><Icon name="doc" size={15} /> Pages</button>
              <button type="button" role="tab" aria-selected={leftTab === "theme"} onClick={() => setLeftTab("theme")}>Theme</button>
            </div>
            <span role="status" className={styles.announce}>{announcement}</span>
            {leftTab === "theme" ? <ThemePanel config={site.theme_config} disabled={readOnly} onChange={patch => change(s => updateTheme(s, patch), "theme-" + Object.keys(patch)[0])} /> : leftTab === "pages" ? <PagesPanel site={site} readOnly={readOnly} change={change} ask={ask} /> : leftTab === "add" ? <ComponentsPanel disabled={readOnly} onAdd={add} onDragItem={setDraggingItem} /> : (
              <>
                <p className={styles.hint}>Drag a section onto another to place it above.</p>
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
                          <Icon name={elements || hasBlock(s.type) ? "grid" : "doc"} size={14} />
                          <span>{s.title || s.type}</span>
                          {s.hidden === true ? <small>hidden</small> : !elements && !hasBlock(s.type) && <small>preview</small>}
                        </button>
                        <button type="button" className={styles.layerDelete} disabled={readOnly} aria-label={`Delete ${s.title || s.type}`} title="Delete section"
                          onClick={() => ask({
                            title: `Delete “${s.title || s.type}”?`, description: "You can bring it back with Undo until you leave the editor.",
                            label: "Delete section", run: () => { change(x => removeSection(x, s.id)); if (selection?.sectionId === s.id) setSelection(null); },
                          })}><Icon name="close" size={13} /></button>
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
                {!site.schema_json.length && <p className={styles.hint}>No sections yet. Open the Add tab to choose one.</p>}
                <button type="button" className={styles.addSection} disabled={readOnly} onClick={() => setLeftTab("add")}><Icon name="plus" size={14} /> Add a section</button>
              </>
            )}
          </aside>

            <div ref={canvasRef} className={styles.canvas} onClick={e => { if (e.target === e.currentTarget) setSelection(null); }}>
              <QuickToolbar site={site} selection={selection} viewport={viewport} readOnly={readOnly} canvas={canvasRef}
                change={change} ask={ask} onSelect={setSelection} onMore={() => setInspectorOpen(true)} />
              <ScaledSheet width={widths[viewport]}>
                {!site.schema_json.length && (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}><Icon name="layers" size={28} /></span>
                    <h2>Your page is empty</h2>
                    <p>Start with a navigation bar and a hero, or pick any design from the Add panel.</p>
                    <div className={styles.buttonRow}>
                      <button type="button" disabled={readOnly} onClick={() => addById("nav-classic")}>+ Navigation bar</button>
                      <button type="button" disabled={readOnly} onClick={() => addById("hero-split")}>+ Hero</button>
                    </div>
                  </div>
                )}
                <SiteRenderer themeConfig={site.theme_config} event={site.event} sections={site.schema_json} pages={site.pages} siteSlug={site.slug} siteId={site.site_id} fallback={renderPreserved} edit={{
                  selection, readOnly, dragging: dragging ?? (draggingItem ? "__component__" : null), dropTarget,
                  onDragSection: setDragging, onDragHover: setDropTarget,
                  onDropComponent: (itemId, beforeId) => { add(componentCatalog.find(c => c.id === itemId), beforeId); setDraggingItem(null); setDropTarget(null); },
                  onSelect: sel => { setSelection(sel); setInspectorOpen(true); },
                  onText: (sectionId, elementId, text) => change(s => updateElement(s, sectionId, elementId, { text })),
                  onFormFields: (id, action) => change(s => editFormFields(s, id, action)),
                  onDropSection: drop,
                }} />
              </ScaledSheet>
            </div>

          <aside className={styles.inspector} hidden={!inspectorOpen}>
            <Inspector site={site} selection={selection} viewport={viewport} readOnly={readOnly}
              change={change} onSelect={setSelection} onError={showError} ask={ask} />
          </aside>
        </div>
      )}
      {inboxOpen && site && <SubmissionsInbox site={site} onClose={() => setInboxOpen(false)} />}
      {eventTab && site && <EventDetailsDialog site={site} initialTab={eventTab} readOnly={readOnly} change={change} onError={showError} onClose={() => setEventTab(null)} />}
      {settingsOpen && <SiteSettings siteId={siteId} onClose={() => setSettingsOpen(false)} onSaved={announce} />}
      {libraryOpen && (
        <ComponentLibrary onClose={() => setLibraryOpen(false)} onAdd={item => { add(item); setLibraryOpen(false); }} />
      )}
      {confirmRequest && (
        <ConfirmDialog title={confirmRequest.title} description={confirmRequest.description} label={confirmRequest.label} busy={false}
          onCancel={() => ask(null)} onConfirm={() => { const run = confirmRequest.run; ask(null); run(); }} />
      )}
    </main>
  );
}
