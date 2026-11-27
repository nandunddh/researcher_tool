"use client";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/icon";
import { LoadingIndicator } from "@/components/loading-indicator";
import { safeImage } from "@/features/studio/site-schema";
import { longDate, parseDay } from "@/features/studio/countdown";
import { BADGE_SIZES, PAPERS, ROLE_COLORS, ROLES, fit, fromCsv, fromRegistrations, fromSpeakers, randomCode, sheets, type Person } from "./badges";
import styles from "./badges.module.css";

type Site = { site_id: string; name: string; event?: { basics?: Record<string, unknown>; speakers?: unknown } };
type Submission = Parameters<typeof fromRegistrations>[0][number];

const LOAD_TIMEOUT_MS = 30_000;
const CSV_TEMPLATE = "Name,Organization,Role\nAda Lovelace,Analytical Society,Speaker\nAlan Turing,University of Manchester,Attendee\n";
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Print-ready name badges for one website's event: people from registrations, speakers and CSV files, many per sheet. */
export function BadgeMaker({ siteId, backHref }: { siteId: string; backHref: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [useRegistrations, setUseRegistrations] = useState(true);
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const [useSpeakers, setUseSpeakers] = useState(true);
  const [extra, setExtra] = useState<Person[]>([]);
  const [changes, setChanges] = useState<Record<string, { role?: string; skip?: boolean }>>({});
  const [sizeId, setSizeId] = useState("a6");
  const [paperId, setPaperId] = useState("a4");
  const [showQr, setShowQr] = useState(true);
  const [showOrg, setShowOrg] = useState(true);
  const [showPhoto, setShowPhoto] = useState(true);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [colors, setColors] = useState<Record<string, string>>(ROLE_COLORS);
  const [qr, setQr] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [attempt, setAttempt] = useState(0);

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
      const basics = s.event?.basics ?? {};
      setTitle(str(basics.name) || s.name);
      const start = parseDay(basics.starts), end = parseDay(basics.ends);
      const when = start === null ? "" : end !== null && end !== start ? `${longDate(start)} – ${longDate(end)}` : longDate(start);
      setSubtitle([when, str(basics.venue)].filter(Boolean).join(" · "));
    }).catch(e => {
      if (cancelled) return;  // the page was left or reloaded; not an error
      setError(timedOut ? "The server is taking too long to answer. Please try again." : e instanceof Error ? e.message : "Could not load the website.");
    })
      .finally(() => clearTimeout(timer));
    // Registrations are owner-only; a team member without access still gets speakers and CSV.
    api<{ submissions: Submission[] }>(`/api/builder/sites/${id}/submissions`, { signal: abort.signal }).then(r => { if (!cancelled) setSubmissions(r.submissions); })
      .catch(() => { if (!cancelled && !timedOut) { setSubmissions([]); setNote("Registrations are only available to the account owner and admins."); } });
    return () => { cancelled = true; clearTimeout(timer); abort.abort(); };
  }, [siteId, attempt]);

  const people = useMemo(() => {
    const all = [
      ...(useRegistrations && submissions ? fromRegistrations(submissions, includeUnpaid) : []),
      ...(useSpeakers ? fromSpeakers(site?.event?.speakers) : []),
      ...extra,
    ];
    return all.map(p => ({ ...p, role: changes[p.code]?.role ?? p.role, skip: changes[p.code]?.skip === true }));
  }, [submissions, site, useRegistrations, includeUnpaid, useSpeakers, extra, changes]);
  const printed = people.filter(p => !p.skip);
  const size = BADGE_SIZES.find(s => s.id === sizeId)!, paper = PAPERS.find(p => p.id === paperId)!;
  const layout = fit(paper, size);
  const pages = sheets(printed, layout.perSheet);

  // QR codes come from the server (they encode only a badge code); fetched again only for new codes.
  const wanted = useMemo(() => (showQr ? printed.map(p => p.code).filter(c => !qr[c]) : []), [showQr, printed, qr]);
  useEffect(() => {
    if (!wanted.length) return;
    const timer = setTimeout(() => {
      api<{ qr: Record<string, string> }>(`/api/builder/sites/${encodeURIComponent(siteId)}/badges/qr`, { method: "POST", body: JSON.stringify({ codes: wanted.slice(0, 2000) }) })
        .then(r => setQr(prev => ({ ...prev, ...r.qr }))).catch(e => setNote(e instanceof Error ? e.message : "QR codes could not be made."));
    }, 300);
    return () => clearTimeout(timer);
  }, [wanted, siteId]);

  // Fit the real-size sheet (in mm) into the preview area; 96 px per inch is the CSS definition of a millimetre.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const sheetPx = (paper.width / 25.4) * 96;
    const update = () => setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 8) / sheetPx)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [paper.width, site]);

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

  if (error) return (
    <main className={`${styles.page} ${styles.center}`}>
      <div className={styles.message}>
        <h1>Badges could not be opened</h1>
        <p role="alert">{error}</p>
        <div className={styles.row}><button type="button" className="primary" onClick={() => setAttempt(n => n + 1)}>Try again</button><a className="button" href={backHref}>Back to SciStudio</a></div>
      </div>
    </main>
  );
  if (!site) return <main className={`${styles.page} ${styles.center}`}><LoadingIndicator label="Loading your event…" /></main>;
  const rolesInUse = ROLES.filter(r => printed.some(p => p.role === r));

  return (
    <main className={styles.page}>
      {/* The printer gets exactly one sheet per page at the chosen paper size. */}
      <style>{`@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`}</style>
      <header className={styles.bar}>
        <a href={backHref} className={styles.back}><Icon name="arrow" size={16} /> SciStudio</a>
        <div><h1>Name badges</h1><p>{site.name}</p></div>
        <button type="button" className="primary" disabled={!printed.length} onClick={() => window.print()}><Icon name="doc" size={16} /> Print or save as PDF</button>
      </header>

      <div className={styles.layout}>
        <aside className={styles.panel} aria-label="Badge settings">
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
            <h2>Design</h2>
            <label>Badge size<select value={sizeId} onChange={e => setSizeId(e.target.value)}>{BADGE_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label>Paper<select value={paperId} onChange={e => setPaperId(e.target.value)}>{PAPERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <p className={styles.hint}>{layout.perSheet} badges per sheet · {pages.length} {pages.length === 1 ? "sheet" : "sheets"} · cut along the dashed lines</p>
            <label>Event name<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></label>
            <label>Line under it<input value={subtitle} maxLength={120} onChange={e => setSubtitle(e.target.value)} /></label>
            <label className={styles.check}><input type="checkbox" checked={showOrg} onChange={e => setShowOrg(e.target.checked)} />Organization</label>
            <label className={styles.check}><input type="checkbox" checked={showPhoto} onChange={e => setShowPhoto(e.target.checked)} />Photos (when there is one)</label>
            <label className={styles.check}><input type="checkbox" checked={showQr} onChange={e => setShowQr(e.target.checked)} />QR code for check-in</label>
            {rolesInUse.length > 0 && <div className={styles.colors}>{rolesInUse.map(r => (
              <label key={r}><input type="color" value={colors[r]} onChange={e => setColors(c => ({ ...c, [r]: e.target.value }))} />{r}</label>
            ))}</div>}
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
                {page.map(p => {
                  const photo = showPhoto ? safeImage(p.photo) : undefined;
                  return (
                    <article key={p.code} className={styles.badge} style={{ width: `${size.width}mm`, height: `${size.height}mm`, "--role": colors[p.role] ?? ROLE_COLORS.Attendee } as CSSProperties}>
                      <header><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</header>
                      <div className={styles.who}>
                        {photo && <img src={photo} alt="" />}
                        <h3>{p.name}</h3>
                        {showOrg && p.organization && <p>{p.organization}</p>}
                        {p.detail && <p className={styles.detail}>{p.detail}</p>}
                      </div>
                      {showQr && qr[p.code] && <img className={styles.qr} src={qr[p.code]} alt="" />}
                      <footer>{p.role}</footer>
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
