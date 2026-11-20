"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { addPage, ensurePages, movePage, removePage, renamePage, switchPage, type EditorSite } from "./editor-model";
import type { Change, ConfirmRequest } from "./inspector";
import styles from "./react-editor.module.css";

/** Lists the website's pages: open, add, rename, reorder and delete. */
export function PagesPanel({ site, readOnly, change, ask }: {
  site: EditorSite; readOnly: boolean; change: Change; ask: (r: ConfirmRequest) => void;
}) {
  const pages = ensurePages(site).pages!;
  const active = ensurePages(site).active_page_id;
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", slug: "" });

  function create() {
    if (readOnly) return;
    change(s => addPage(s, newName || "New page"));
    setNewName("");
  }
  function startEdit(id: string) {
    const p = pages.find(x => x.id === id);
    if (!p) return;
    setEditing(id);
    setDraft({ name: p.name ?? "", slug: (p.slug ?? "").replace(/^\/+|\/+$/g, "") });
  }
  function saveEdit() {
    if (!editing) return;
    change(s => renamePage(s, editing, draft.name, draft.slug || draft.name));
    setEditing(null);
  }

  return (
    <div className={styles.pages}>
      <p className={styles.hint}>Click a page to edit it. New pages start with your navigation bar and footer.</p>
      <ul className={styles.pageList}>
        {pages.map((p, index) => (
          <li key={p.id} data-active={p.id === active || undefined}>
            {editing === p.id ? (
              <div className={styles.pageEdit}>
                <label className={styles.field}><span>Page name</span>
                  <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }} /></label>
                {!p.is_home && (
                  <label className={styles.field}><span>Web address</span>
                    <span className={styles.slugRow}><i>/{site.slug}/</i>
                      <input value={draft.slug} onChange={e => setDraft(d => ({ ...d, slug: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(); }} /></span></label>
                )}
                <div className={styles.buttonRow}>
                  <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className={styles.save} onClick={saveEdit}>Save</button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" className={styles.pageOpen} aria-current={p.id === active ? "page" : undefined}
                  onClick={() => change(s => switchPage(s, p.id))}>
                  <Icon name="doc" size={14} />
                  <span>{p.name || "Untitled page"}</span>
                  {p.is_home && <small>Home</small>}
                </button>
                <span className={styles.pageTools}>
                  <button type="button" disabled={readOnly || index === 0} onClick={() => change(s => movePage(s, p.id, -1))} aria-label={`Move ${p.name} up`}>↑</button>
                  <button type="button" disabled={readOnly || index === pages.length - 1} onClick={() => change(s => movePage(s, p.id, 1))} aria-label={`Move ${p.name} down`}>↓</button>
                  <button type="button" disabled={readOnly} onClick={() => startEdit(p.id)} aria-label={`Rename ${p.name}`}><Icon name="edit" size={13} /></button>
                  {!p.is_home && (
                    <button type="button" disabled={readOnly} aria-label={`Delete ${p.name}`}
                      onClick={() => ask({
                        title: `Delete the “${p.name}” page?`,
                        description: "The page and its sections are removed. You can bring it back with Undo until you leave the editor.",
                        label: "Delete page",
                        run: () => change(s => removePage(s, p.id)),
                      })}><Icon name="close" size={13} /></button>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.newPage}>
        <input value={newName} placeholder="New page name, e.g. Program" disabled={readOnly} aria-label="New page name"
          onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") create(); }} />
        <button type="button" className={styles.addPrimary} disabled={readOnly} onClick={create}><Icon name="plus" size={14} /> Add page</button>
      </div>
    </div>
  );
}
