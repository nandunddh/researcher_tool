"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/icon";
import { LoadingIndicator } from "@/components/loading-indicator";
import { longDate, parseDay } from "@/features/studio/countdown";
import { safeImage } from "@/features/studio/site-schema";
import { BADGE_SIZES, PAPERS, ROLES, SAMPLE_PERSON, fit, fromCsv, fromRegistrations, fromSpeakers, randomCode, sheets, sponsorLogos, type Person } from "./badges";
import { DEFAULT_DESIGN, cleanDesign, type BadgeDesign } from "./design";
import { Badge } from "./badge";
import { DesignPanel } from "./design-panel";
import { TemplateGallery } from "./template-gallery";
import styles from "./badges.module.css";

type EventDetails = { basics?: Record<string, unknown>; speakers?: unknown; badge_design?: unknown } & Record<string, unknown>;
type Site = { site_id: string; name: string; event?: EventDetails; schema_json?: unknown; pages?: unknown };
type Step = "template" | "design" | "people";
type SiteSummary = { site_id: string; name: string };
type Submission = Parameters<typeof fromRegistrations>[0][number];
type SaveState = "saved" | "saving" | "unsaved" | "error";

const LOAD_TIMEOUT_MS = 30_000;
const SAVE_DELAY_MS = 1200;
const CSV_TEMPLATE = "Name,Organization,Role\nAda Lovelace,Analytical Society,Speaker\nAlan Turing,University of Manchester,Attendee\n";
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The event's own name and "dates · venue" line, used until the organiser types their own. */
function eventTexts(site: Site) {
  const basics = site.event?.basics ?? {};
  const start = parseDay(basics.starts), end = parseDay(basics.ends);
  const when = start === null ? "" : end !== null && end !== start ? `${longDate(start)} – ${longDate(end)}` : longDate(start);
  return { title: str(basics.name) || site.name, subtitle: [when, str(basics.venue)].filter(Boolean).join(" · ") };
}

/** Print-ready name badges for one website's event: pick a template, design it, choose people, print or save as PDF. */
export function BadgeMaker({ siteId, backHref }: { siteId: string; backHref: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [design, setDesign] = useState<BadgeDesign | null>(null);
  const [step, setStep] = useState<Step>("template");
  const [previewCode, setPreviewCode] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [useRegistrations, setUseRegistrations] = useState(true);
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const [useSpeakers, setUseSpeakers] = useState(true);
  const [extra, setExtra] = useState<Person[]>([]);
  const [changes, setChanges] = useState<Record<string, { role?: string; skip?: boolean }>>({});
  const [sizeId, setSizeId] = useState("a6");
  const [paperId, setPaperId] = useState("a4");
  const [qr, setQr] = useState<Record<string, string>>({});
  const [otherSites, setOtherSites] = useState<SiteSummary[] | null>(null);
  const [scale, setScale] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLElement>(null);
  const eventRef = useRef<EventDetails>({});

  useEffect(() => {
    const id = encodeURIComponent(siteId);
    // A slow or unreachable server ends in a clear message with Try again, never an endless spinner.
    const abort = new AbortController();
    let timedOut = false, cancelled = false;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, LOAD_TIMEOUT_MS);
    setError("");
    api<Site>(`/api/builder/sites/${id}`, { signal: abort.signal }).then(s => {
      if (cancelled) return;
      setSite(s);
      eventRef.current = s.event ?? {};
      const saved = s.event?.badge_design;
      // First time: pick a template. Afterwards: open on the one-badge designer, never straight on the sheets.
      if (saved) { setDesign(cleanDesign(saved)); setStep("design"); }
      else { setDesign({ ...DEFAULT_DESIGN, ...eventTexts(s) }); setStep("template"); }
    }).catch(e => {
      if (cancelled) return;  // the page was left or reloaded; not an error
      setError(timedOut ? "The server is taking too long to answer. Please try again." : e instanceof Error ? e.message : "Could not load the website.");
    }).finally(() => clearTimeout(timer));
    // Registrations are owner-only; a team member without access still gets speakers and CSV.
    api<{ submissions: Submission[] }>(`/api/builder/sites/${id}/submissions`, { signal: abort.signal }).then(r => { if (!cancelled) setSubmissions(r.submissions); })
      .catch(() => { if (!cancelled && !timedOut) { setSubmissions([]); setNote("Registrations are only available to the account owner and admins."); } });
    return () => { cancelled = true; clearTimeout(timer); abort.abort(); };
  }, [siteId, attempt]);

  // The design is saved with the website's Event details a moment after the last change.
  const save = useCallback(async (next: BadgeDesign) => {
    setSaveState("saving");
    const event = { ...eventRef.current, badge_design: next };
    try {
      await api(`/api/builder/sites/${encodeURIComponent(siteId)}`, { method: "PUT", body: JSON.stringify({ event }) });
      eventRef.current = event;
      setSaveState("saved");
    } catch { setSaveState("error"); }
  }, [siteId]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateDesign = useCallback((next: BadgeDesign) => {
    setDesign(next);
    setSaveState("unsaved");
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => void save(next), SAVE_DELAY_MS);
  }, [save]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (saveState !== "unsaved" && saveState !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const people = useMemo(() => {
    const all = [
      ...(useRegistrations && submissions ? fromRegistrations(submissions, includeUnpaid) : []),
      ...(useSpeakers ? fromSpeakers(site?.event?.speakers) : []),
      ...extra,
    ];
    return all.map(p => ({ ...p, role: changes[p.code]?.role ?? p.role, skip: changes[p.code]?.skip === true }));
  }, [submissions, site, useRegistrations, includeUnpaid, useSpeakers, extra, changes]);
  const printed = useMemo(() => people.filter(p => !p.skip), [people]);
  const sponsors = useMemo(() => (site ? sponsorLogos(site, safeImage) : []), [site]);
  const size = BADGE_SIZES.find(s => s.id === sizeId)!, paper = PAPERS.find(p => p.id === paperId)!;
  const layout = fit(paper, size);
  const pages = sheets(printed, layout.perSheet);

  // QR codes come from the server (they encode only a badge code); fetched again only for new codes.
  const wanted = useMemo(() => (design?.show.qr ? printed.map(p => p.code).filter(c => !qr[c]) : []), [design?.show.qr, printed, qr]);
  useEffect(() => {
    if (!wanted.length) return;
    const timer = setTimeout(() => {
      api<{ qr: Record<string, string> }>(`/api/builder/sites/${encodeURIComponent(siteId)}/badges/qr`, { method: "POST", body: JSON.stringify({ codes: wanted.slice(0, 2000) }) })
        .then(r => setQr(prev => ({ ...prev, ...r.qr }))).catch(e => setNote(e instanceof Error ? e.message : "QR codes could not be made."));
    }, 300);
    return () => clearTimeout(timer);
  }, [wanted, siteId]);

  // Fit the real-size sheet (in mm) into the preview area; CSS defines 96 px per inch.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const sheetPx = (paper.width / 25.4) * 96;
    const update = () => setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 8) / sheetPx)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [paper.width, site, step]);

  function change(code: string, patch: { role?: string; skip?: boolean }) {
    setChanges(prev => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) { setNote("Choose a CSV file under 2 MB."); return; }
    const { people: added, problem } = fromCsv(await file.text(), randomCode);
    setNote(problem ?? `${added.length} people added from ${file.name}.`);
    if (!problem) setExtra(prev => [...prev, ...added]);
  }
  function addPerson(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = str(form.get("name")).trim();
    if (!name) return;
    setExtra(prev => [...prev, { code: randomCode(), name, organization: str(form.get("organization")).trim(), role: str(form.get("role")) || "Attendee", source: "manual" }]);
    e.currentTarget.reset();
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "badges-template.csv" }).click();
    URL.revokeObjectURL(url);
  }
  async function listOtherSites() {
    try { setOtherSites((await api<{ sites: SiteSummary[] }>("/api/builder/sites")).sites.filter(s => s.site_id !== siteId)); }
    catch (e) { setNote(e instanceof Error ? e.message : "Your websites could not be listed."); }
  }
  async function copyFrom(otherId: string) {
    if (!otherId || !design) return;
    try {
      const other = await api<Site>(`/api/builder/sites/${encodeURIComponent(otherId)}`);
      if (!other.event?.badge_design) { setNote(`“${other.name}” has no badge design yet.`); return; }
      // The design comes over; this event's own name and date line stay.
      updateDesign({ ...cleanDesign(other.event.badge_design), title: design.title, subtitle: design.subtitle });
      setNote(`Design copied from “${other.name}”.`);
    } catch (e) { setNote(e instanceof Error ? e.message : "That design could not be copied."); }
  }

  if (error) return (
    <main className={`${styles.page} ${styles.center}`}>
      <div className={styles.message}>
        <h1>Badges could not be opened</h1>
        <p role="alert">{error}</p>
        <div className={styles.row}><button type="button" className="primary" onClick={() => setAttempt(n => n + 1)}>Try again</button><a className="button" href={backHref}>Back to SciStudio</a></div>
      </div>
    </main>
  );
  if (!site || !design) return <main className={`${styles.page} ${styles.center}`}><LoadingIndicator label="Loading your event…" /></main>;

  const saveText = { saved: "All changes saved", saving: "Saving…", unsaved: "Saving soon…", error: "Not saved. Check your connection; your next change will try again." }[saveState];
  const stepNames: [Step, string][] = [["template", "1. Template"], ["design", "2. Design one badge"], ["people", "3. Everyone and print"]];
  const bar = (
    <header className={styles.bar}>
      <a href={backHref} className={styles.back}><Icon name="arrow" size={16} /> SciStudio</a>
      <div><h1>Name badges</h1><p>{site.name}</p></div>
      <nav className={styles.steps} aria-label="Steps">
        {stepNames.map(([id, label]) => <button key={id} type="button" aria-current={step === id ? "step" : undefined} onClick={() => setStep(id)}>{label}</button>)}
      </nav>
      {step !== "template" && <span className={styles.saveState} data-error={saveState === "error" || undefined} role="status">{saveText}</span>}
      {step === "people" && <button type="button" className="primary" disabled={!printed.length} onClick={() => window.print()}><Icon name="doc" size={16} /> Print or save as PDF</button>}
    </header>
  );
  if (step === "template") return (
    <main className={styles.page}>
      {bar}
      <TemplateGallery current={design} sponsors={sponsors} onPick={next => { updateDesign(next); setStep("design"); }}
        onCancel={site.event?.badge_design ? () => setStep("design") : undefined} />
    </main>
  );

  if (step === "design") {
    // One badge, large, for one person (or a sample). Every change applies to all badges.
    const preview = printed.find(p => p.code === previewCode) ?? printed[0] ?? SAMPLE_PERSON;
    const px = (mm: number) => (mm / 25.4) * 96;
    const zoom = Math.min(1.8, 560 / px(size.height), 520 / px(size.width));
    return (
      <main className={styles.page}>
        {bar}
        <div className={styles.layout}>
          <aside className={styles.panel} aria-label="Badge design">
            <section>
              <h2>Badge size</h2>
              <label>Size<select value={sizeId} onChange={e => setSizeId(e.target.value)}>{BADGE_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            </section>
            <DesignPanel design={design} siteId={siteId} sponsorCount={sponsors.length} onChange={updateDesign} onPickTemplate={() => setStep("template")} />
            <section>
              <h2>Use a design from another event</h2>
              {otherSites === null
                ? <button type="button" onClick={() => void listOtherSites()}>Choose a website…</button>
                : otherSites.length === 0 ? <p className={styles.hint}>You have no other websites yet.</p>
                  : <select defaultValue="" onChange={e => void copyFrom(e.target.value)} aria-label="Copy the badge design from">
                      <option value="" disabled>Copy the badge design from…</option>
                      {otherSites.map(s => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}
                    </select>}
              {note && <p className={styles.note} role="status">{note}</p>}
            </section>
          </aside>
          <section className={styles.single} aria-label="Badge preview">
            <div style={{ zoom }}><Badge design={design} person={preview} size={size} qr={qr[preview.code]} sponsors={sponsors} /></div>
            {printed.length > 0 && (
              <label className={styles.row}>Preview with
                <select value={preview.code} onChange={e => setPreviewCode(e.target.value)}>{printed.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
              </label>
            )}
            <div className={styles.primaryCta}>
              <button type="button" className="primary" onClick={() => setStep("people")}>Use this design for everyone →</button>
              <span className={styles.hint}>{printed.length ? `${printed.length} badges will use this design.` : "Next, choose who gets a badge."}</span>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* The printer gets exactly one sheet per page at the chosen paper size. */}
      <style>{`@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`}</style>
      {bar}
      <div className={styles.layout}>
        <aside className={styles.panel} aria-label="People and printing">
          <section>
            <button type="button" onClick={() => setStep("design")}>← Edit the design</button>
          </section>
          <section>
            <h2>People</h2>
            <label className={styles.check}><input type="checkbox" checked={useRegistrations} onChange={e => setUseRegistrations(e.target.checked)} />Registrations{submissions ? ` (${fromRegistrations(submissions, includeUnpaid).length})` : ""}</label>
            {useRegistrations && <label className={`${styles.check} ${styles.indent}`}><input type="checkbox" checked={includeUnpaid} onChange={e => setIncludeUnpaid(e.target.checked)} />Include unpaid</label>}
            <label className={styles.check}><input type="checkbox" checked={useSpeakers} onChange={e => setUseSpeakers(e.target.checked)} />Speakers from Event details ({fromSpeakers(site.event?.speakers).length})</label>
            <div className={styles.row}>
              <button type="button" onClick={() => fileInput.current?.click()}>Upload CSV</button>
              <button type="button" className="text-button" onClick={downloadTemplate}>CSV template</button>
              <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={e => void upload(e)} />
            </div>
            <form className={styles.addForm} onSubmit={addPerson}>
              <input name="name" placeholder="Name" aria-label="Name" required maxLength={120} />
              <input name="organization" placeholder="Organization" aria-label="Organization" maxLength={120} />
              <select name="role" aria-label="Role" defaultValue="Attendee">{ROLES.map(r => <option key={r}>{r}</option>)}</select>
              <button type="submit">Add</button>
            </form>
            {note && <p className={styles.note} role="status">{note}</p>}
          </section>

          <section>
            <h2>Size and paper</h2>
            <label>Badge size<select value={sizeId} onChange={e => setSizeId(e.target.value)}>{BADGE_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label>Paper<select value={paperId} onChange={e => setPaperId(e.target.value)}>{PAPERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <p className={styles.hint}>{layout.perSheet} badges per sheet · {pages.length} {pages.length === 1 ? "sheet" : "sheets"} · cut along the dashed lines</p>
          </section>

          <section>
            <h2>{people.length} {people.length === 1 ? "person" : "people"}</h2>
            {!people.length && <p className={styles.hint}>Turn on registrations or speakers, upload a CSV, or add people above.</p>}
            <ul className={styles.people}>
              {people.map(p => (
                <li key={p.code} data-skip={p.skip || undefined}>
                  <input type="checkbox" checked={!p.skip} onChange={e => change(p.code, { skip: !e.target.checked })} aria-label={`Print a badge for ${p.name}`} />
                  <span><strong>{p.name}</strong><small>{[p.organization, p.detail].filter(Boolean).join(" · ")}</small></span>
                  <select value={p.role} onChange={e => change(p.code, { role: e.target.value })} aria-label={`Role of ${p.name}`}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
                  {(p.source === "csv" || p.source === "manual") && <button type="button" className="text-button" aria-label={`Remove ${p.name}`} onClick={() => setExtra(prev => prev.filter(x => x.code !== p.code))}>×</button>}
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section ref={stage} className={styles.stage} aria-label="Badge sheets">
          {!pages.length && <p className={styles.empty}>Badges appear here.</p>}
          <div className={styles.print} style={{ "--fit": scale } as CSSProperties}>
            {pages.map((page, n) => (
              <div key={n} className={styles.sheet} style={{ width: `${paper.width}mm`, height: `${paper.height}mm`, gridTemplateColumns: `repeat(${layout.cols}, ${size.width}mm)`, gridAutoRows: `${size.height}mm` }}>
                {page.map(p => <Badge key={p.code} design={design} person={p} size={size} qr={qr[p.code]} sponsors={sponsors} />)}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
