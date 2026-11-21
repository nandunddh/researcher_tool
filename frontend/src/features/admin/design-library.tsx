"use client";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { api } from "@/lib/api";
import type { ImportedDesign } from "@/features/studio/design-library";
import { AdminShell } from "./shell";

/** Root admin: import AI-made design files (sections and templates) and remove old ones. */
export function DesignLibrary() {
  const [items, setItems] = useState<ImportedDesign[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<ImportedDesign | null>(null);

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

  return (
    <AdminShell title="Design Library" path="/root/designs">
      <section className="account-panel">
        <h2>Import a design</h2>
        <p>Paste a design file made with the prompt in <code>docs/DESIGN_PROMPT.md</code>, or choose a <code>.json</code> file. Sections appear in everyone&apos;s Components panel; templates appear in the template gallery.</p>
        {error && <p className="alert" role="alert">{error}</p>}
        <textarea aria-label="Design file" rows={10} value={text} onChange={e => setText(e.target.value)} placeholder='{"format": "scistudio-design", "kind": "section", ...}'
          style={{ width: "100%", fontFamily: "monospace", fontSize: ".85rem" }} />
        <div className="actions" style={{ marginTop: "0.75rem" }}>
          <button className="primary" type="button" disabled={busy || !text.trim()} onClick={() => void importText(text)}>{busy ? "Importing…" : "Import"}</button>
          <label className="button">
            Choose file
            <input type="file" accept=".json,application/json" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) await importText(await file.text()); }} />
          </label>
        </div>
      </section>

      <section className="account-panel" style={{ marginTop: "1.5rem" }}>
        <h2>Imported designs ({items.length})</h2>
        {!items.length && <p>No imported designs yet.</p>}
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: ".5rem" }}>
          {items.map(item => (
            <li key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: ".75rem 1rem", border: "1px solid var(--line, #e5e7eb)", borderRadius: 10 }}>
              <span><strong>{item.name}</strong> · {item.kind === "template" ? "Template" : "Section"} · {item.category} · {item.level}
                <br /><small>{new Date(item.created_at).toLocaleDateString()} {item.description && `· ${item.description}`}</small></span>
              <button type="button" className="danger" onClick={() => setRemoving(item)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
      {removing && <ConfirmDialog title="Remove this design?" description={`“${removing.name}” disappears from the library. Websites that already use it keep their copy.`}
        label="Remove" busy={false} onCancel={() => setRemoving(null)} onConfirm={() => void remove(removing)} />}
    </AdminShell>
  );
}
