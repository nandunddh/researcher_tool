"use client";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { api } from "@/lib/api";
import type { ImportedDesign } from "@/features/studio/design-library";
import { Icon } from "@/components/icon";
import { AdminShell } from "./shell";
import styles from "./design-library.module.css";

const PLACEHOLDER = ["{", '  "format": "scistudio-design",', '  "kind": "section",', '  "name": "Speaker spotlight",', "  ...", "}"].join("\n");

/** Root admin: import AI-made design files (sections and templates) and remove old ones. */
export function DesignLibrary() {
  const [items, setItems] = useState<ImportedDesign[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<ImportedDesign | null>(null);
  const [dragging, setDragging] = useState(false);

  const load = () => api<{ items: ImportedDesign[] }>("/api/library").then(r => setItems(r.items)).catch(e => setError(e instanceof Error ? e.message : "Could not load designs."));
  useEffect(() => { void load(); }, []);

  async function importText(raw: string) {
    setError("");
    let body: unknown;
    try {
      // AI replies often wrap JSON in ``` fences; keep only the JSON.
      body = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
    } catch {
      setError("That is not valid JSON. Copy the whole design file from the AI reply and try again.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ items: ImportedDesign[] }>("/api/library", { method: "POST", body: JSON.stringify(body) });
      toast.success(`Imported ${result.items.map(i => i.name).join(", ")}`);
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ImportedDesign) {
    try {
      await api(`/api/library/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      setItems(old => old.filter(i => i.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the design.");
    }
    setRemoving(null);
  }

  async function importFile(file?: File) {
    if (file) await importText(await file.text());
  }

  return (
    <AdminShell title="Design Library" path="/root/designs">
      <div className={styles.page}>
        <section className={styles.card}>
          <div className={styles.head}><h2>Import a design</h2></div>
          <p className={styles.lead}>Sections appear in everyone&apos;s Components panel. Templates appear in the template gallery.</p>
          <ol className={styles.steps}>
            <li><b>1</b><span>Copy a prompt from <code>docs/DESIGN_PROMPT.md</code></span></li>
            <li><b>2</b><span>Ask any AI and copy its JSON reply</span></li>
            <li><b>3</b><span>Paste it below, or drop a <code>.json</code> file</span></li>
          </ol>
          <div className={styles.editor} data-drag={dragging || undefined}
            onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); void importFile(e.dataTransfer.files[0]); }}>
            <textarea aria-label="Design file" spellCheck={false} value={text} onChange={e => setText(e.target.value)}
              placeholder={PLACEHOLDER} />
            {!text && <span className={styles.dropHint}>or drop a .json file here</span>}
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button className={styles.primary} type="button" disabled={busy || !text.trim()} onClick={() => void importText(text)}>
              <Icon name="plus" size={16} />{busy ? "Importing…" : "Import design"}
            </button>
            <label className={styles.secondary}>
              <Icon name="doc" size={16} />Upload .json
              <input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void importFile(file); }} />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.head}><h2>Imported designs</h2><span className={styles.count}>{items.length}</span></div>
          {!items.length ? (
            <div className={styles.empty}>
              <span><Icon name="layers" size={22} /></span>
              <strong>No imported designs yet</strong>
              Your first import will show up here.
            </div>
          ) : (
            <ul className={styles.list}>
              {items.map(item => (
                <li key={item.id} className={styles.item}>
                  <span className={styles.thumb} data-kind={item.kind}><Icon name={item.kind === "template" ? "grid" : "layers"} size={18} /></span>
                  <div className={styles.meta}>
                    <strong title={item.description || item.name}>{item.name}</strong>
                    <div className={styles.tags}>
                      <span className={styles.tag}>{item.kind}</span>
                      <span className={styles.tag}>{item.category}</span>
                      <span className={styles.tag}>{item.level}</span>
                      <span className={styles.tag}>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button type="button" className={styles.remove} aria-label={`Remove ${item.name}`} title="Remove" onClick={() => setRemoving(item)}>
                    <Icon name="close" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {removing && <ConfirmDialog title="Remove this design?" description={`“${removing.name}” disappears from the library. Websites that already use it keep their copy.`}
        label="Remove" busy={false} onCancel={() => setRemoving(null)} onConfirm={() => void remove(removing)} />}
    </AdminShell>
  );
}
