"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { studioPath, type Conference, type Namespace, type Site, type Template, type User } from "@/lib/contracts";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { SignOut } from "@/components/sign-out";
import { ComponentLibrary } from "./component-library";
import { Templates } from "./templates";
import { CreateSite } from "./create-site";

export function StudioDashboard({ namespace, user }: { namespace: Namespace; user: User }) {
  const [library,setLibrary]=useState(false);
  const [sites, setSites] = useState<Site[]>([]), [conferences, setConferences] = useState<Conference[]>([]), [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [query, setQuery] = useState(""), [conference, setConference] = useState("");
  const [gallery, setGallery] = useState(false), [creating, setCreating] = useState(false), [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [newConference, setNewConference] = useState(false), [conferenceName, setConferenceName] = useState(""), [busy, setBusy] = useState(false);
  const [deleteSite, setDeleteSite] = useState<Site | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const [siteData, conferenceData, templateData] = await Promise.all([
        api<{ sites: Site[] }>("/api/builder/sites", { signal }),
        api<{ conferences: Conference[] }>("/api/builder/conferences", { signal }),
        api<{ templates: Template[] }>("/api/builder/templates", { signal }),
      ]);
      setSites(siteData.sites); setConferences(conferenceData.conferences);
      setTemplates([{ id: "blank", name: "Start from scratch", category: "Blank canvas", description: "Add your own sections in SciStudio." }, ...templateData.templates.filter(t => t.id !== "blank")]);
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof ApiError && error.status === 401) { window.location.assign("/"); return; }
      setError(error instanceof Error ? error.message : "Unable to load your websites.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  function create(template: string | null = null) { setSelectedTemplate(template); setGallery(false); setCreating(true); }
  const visible = sites.filter(site => (!conference || site.conference_id === conference) && `${site.name} ${site.slug}`.toLowerCase().includes(query.toLowerCase()));
  async function addConference() {
    setBusy(true); setError("");
    try { await api("/api/builder/conferences", { method: "POST", body: JSON.stringify({ name: conferenceName.trim() }) }); setNewConference(false); setConferenceName(""); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to create conference."); } finally { setBusy(false); }
  }
  return <div className="studio-workspace"><header className="studio-header"><a href={studioPath(namespace)} className="studio-brand"><span className="brand-symbol"><Icon name="layers" size={25} /></span><span>SciStudio<small>Website builder</small></span></a><nav className="header-actions"><a className="button" href={`/${namespace}/dashboard`}><Icon name="arrow" />Go to dashboard</a><button onClick={()=>setLibrary(true)}><Icon name="layers"/>Components</button><button onClick={() => setGallery(true)} disabled={loading}><Icon name="grid" />Templates</button><button className="primary" onClick={() => create()} disabled={loading}><Icon name="plus" />Create Website</button><span className="profile"><Icon name="user" />{user.client_name}</span><SignOut /></nav></header>
    <main className="studio-main">
      {error && <div className="alert" role="alert">{error} <button onClick={() => void load()}>Retry</button></div>}
      <div className="workspace-toolbar"><label className="inline-label">Conference<select value={conference} onChange={e => setConference(e.target.value)}><option value="">All conferences ({conferences.length})</option>{conferences.map(item => <option key={item.conference_id} value={item.conference_id}>{item.name}</option>)}</select></label><button onClick={() => setNewConference(true)}><Icon name="plus" />New Conference</button></div>
      {loading ? <p role="status">Loading your websites…</p> : sites.length === 0 ? <><section className="studio-empty"><div className="canvas-illustration" aria-hidden="true"><div className="illustration-dots">•••</div><div className="illustration-lines"><i /><i /><i /><b /></div><div className="illustration-shape" /></div><small>SCISTUDIO WORKSPACE</small><h1>A new space for your next big idea.</h1><p>Start with a beautiful design, make it yours, and build something worth sharing.</p><button className="primary" onClick={() => create()}><Icon name="plus" />Create your first website</button><button className="text-button" onClick={() => setGallery(true)}>Explore the template collection</button></section><div className="start-paths">{[["01 / DISCOVER", "Find your starting point", "Explore layouts made for research and events."], ["02 / CREATE", "Make it your own", "Turn your conference brief into a website."], ["03 / ORGANIZE", "A home for every event", "Group websites into conference workspaces."]].map(([number, title, description], index) => <button key={number} onClick={() => index === 0 ? setGallery(true) : index === 1 ? create() : setNewConference(true)}><small>{number}</small><strong>{title}</strong><span>{description}</span></button>)}</div></> : <><div className="toolbar"><label className="search-field"><Icon name="search" /><input aria-label="Search websites" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your websites…" /></label><small>{visible.length} {visible.length === 1 ? "website" : "websites"}</small></div><div className="site-grid">{visible.map(site => <article className="site-card" key={site.site_id}><div className="site-heading"><h2>{site.name}</h2><span className={`badge ${site.status === "published" ? "published" : "draft"}`}>{site.status}</span></div><p className="site-address">/sites/{site.slug}</p><small>{conferences.find(item => item.conference_id === site.conference_id)?.name || "General workspace"}</small><p className="updated">Updated {site.updated_at?.slice(0, 10) || "recently"}</p><div className="actions"><a className="button primary" href={studioPath(namespace, site.site_id)}><Icon name="edit" />Edit</a><a className="button" href={studioPath(namespace, site.site_id, "preview")} target="_blank" rel="noopener noreferrer"><Icon name="external" />Preview</a><a className="button" href={`/api/builder/sites/${encodeURIComponent(site.site_id)}/export`}>ZIP</a><button className="danger text-button" onClick={() => setDeleteSite(site)}>Delete</button></div></article>)}</div>{visible.length === 0 && <p>No websites match your search or conference filter.</p>}</>}
    </main>
    {library && <ComponentLibrary onClose={()=>setLibrary(false)}/> }
    {gallery && <Templates templates={templates} onUse={create} onClose={() => setGallery(false)} />}
    {creating && <CreateSite namespace={namespace} templates={templates} conferences={conferences} initialTemplate={selectedTemplate} onClose={() => setCreating(false)} />}
    {newConference && <Modal title="New conference" onClose={() => { if (!busy) setNewConference(false); }}><form onSubmit={e => { e.preventDefault(); void addConference(); }}><label>Conference name<input required value={conferenceName} onChange={e => setConferenceName(e.target.value)} /></label>{error && <p role="alert" className="alert">{error}</p>}<footer className="modal-actions"><button className="primary" disabled={busy}>{busy ? "Creating…" : "Create conference"}</button></footer></form></Modal>}
    {deleteSite && <Modal title="Delete website?" onClose={() => { if (!busy) setDeleteSite(null); }}><p>Delete “{deleteSite.name}”? This cannot be undone.</p>{error && <p role="alert" className="alert">{error}</p>}<footer className="modal-actions"><button disabled={busy} onClick={() => setDeleteSite(null)}>Cancel</button><button className="danger" disabled={busy} onClick={async () => { setBusy(true); try { await api(`/api/builder/sites/${encodeURIComponent(deleteSite.site_id)}`, { method: "DELETE" }); setDeleteSite(null); await load(); } catch (error) { setError(error instanceof Error ? error.message : "Unable to delete."); } finally { setBusy(false); } }}>{busy ? "Deleting…" : "Delete website"}</button></footer></Modal>}
  </div>;
}
