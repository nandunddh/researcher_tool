"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { studioPath, type ClientBrief, type Conference, type Namespace, type Site, type Template } from "@/lib/contracts";
import { Modal } from "@/components/modal";
const emptyBrief: ClientBrief = { conference_name: "", start_date: "", end_date: "", venue_format: "", contact_email: "" };
export function CreateSite({ namespace, templates, conferences, initialTemplate, onClose }: { namespace: Namespace; templates: Template[]; conferences: Conference[]; initialTemplate: string | null; onClose: () => void }) {
  const [step, setStep] = useState(1), [brief, setBrief] = useState(emptyBrief), [template, setTemplate] = useState(initialTemplate || "summit");
  const [conference, setConference] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function create() {
    setBusy(true); setError("");
    try {
      const result = await api<{ site: Site }>("/api/builder/sites", { method: "POST", body: JSON.stringify({ name: brief.conference_name.trim(), template_id: template, conference_id: conference || null, client_brief: brief }) });
      // Full navigation intentionally enters the existing editor during migration.
      window.location.assign(studioPath(namespace, result.site.site_id));
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to create website."); setBusy(false); }
  }
  return <Modal title="Create Conference Website" onClose={() => { if (!busy) onClose(); }}>
    <ol className="steps">{["Client Brief", "Review Brief", "Template & Design"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step === index + 1 ? "current" : ""}><b>{index + 1}</b>{label}</li>)}</ol>
    {error && <p role="alert" className="alert">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); if (step < 3) setStep(step + 1); else void create(); }}>
      {step === 1 && <div className="form-grid"><label className="full">Conference name<input required value={brief.conference_name} onChange={e => setBrief({ ...brief, conference_name: e.target.value })} /></label><label>Start date<input type="date" value={brief.start_date} onChange={e => setBrief({ ...brief, start_date: e.target.value })} /></label><label>End date<input type="date" min={brief.start_date || undefined} value={brief.end_date} onChange={e => setBrief({ ...brief, end_date: e.target.value })} /></label><label className="full">Venue or online format<input value={brief.venue_format} onChange={e => setBrief({ ...brief, venue_format: e.target.value })} placeholder="Venue, city or online" /></label><label className="full">Contact email<input type="email" value={brief.contact_email} onChange={e => setBrief({ ...brief, contact_email: e.target.value })} /></label><small className="full">Only the conference name is required. You can add the remaining details later.</small></div>}
      {step === 2 && <dl className="review">{Object.entries({ "Conference": brief.conference_name, "Start date": brief.start_date, "End date": brief.end_date, "Venue / format": brief.venue_format, "Contact email": brief.contact_email }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not provided — add later"}</dd></div>)}</dl>}
      {step === 3 && <><div className="template-choices">{templates.map(item => <label key={item.id} className={template === item.id ? "template-choice selected" : "template-choice"}><input type="radio" name="template" value={item.id} checked={template === item.id} onChange={() => setTemplate(item.id)} /><strong>{item.name}</strong><small>{item.description}</small></label>)}</div><label>Conference workspace<select value={conference} onChange={e => setConference(e.target.value)}><option value="">General workspace</option>{conferences.map(item => <option key={item.conference_id} value={item.conference_id}>{item.name}</option>)}</select></label></>}
      <footer className="modal-actions">{step > 1 && <button type="button" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}<button className="primary" disabled={busy}>{busy ? "Creating…" : step === 3 ? "Create website & open Studio" : step === 1 ? "Review brief" : "Choose design"}</button></footer>
    </form>
  </Modal>;
}
