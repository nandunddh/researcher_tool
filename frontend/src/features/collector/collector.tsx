"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/components/icon";
import styles from "./collector.module.css";

type Run = { id:string; topic:string; status:string; source:string; collected:number; target:number; shortfall:number; min_score?:number; updated_at:string; started_at:string; source_errors:{source:string; message:string}[] };
const statusLabels = {
  deliverable_domain: "Mail domain ready", role: "Role address", disposable: "Disposable",
  invalid_format: "Invalid format", no_domain: "Domain missing", no_mail_server: "No mail server", unknown: "Unknown",
};
type Contact = { researcher_name:string; professional_email:string; affiliation:string; data_source:string; email_confidence:string; delivery_status?:keyof typeof statusLabels };
type CheckBatch = {checked:number; next_after:string | null};
type Stats = { total:number; today:number; datasets:number };
type LogLine = { at:string; text:string; level:"info"|"ok"|"warn"|"error" };
const endpoint = "/api/collector/runs";
const pageSize = 50;
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
const clock = (d = new Date()) => d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const RUN_LABEL: Record<string,string> = { running:"Running", completed:"Completed", partial:"Partial", stopped:"Stopped", interrupted:"Stopped", failed:"Failed" };

/** The research collector app: its own sidebar, summary cards, new collection form, live monitor, datasets and leads. */
export function CollectorApp({ namespace, userName, tier }: { namespace:string; userName:string; tier:string }) {
  return (
    <div className={styles.app}>
      <aside className={styles.side}>
        <a className={styles.brand} href={`/${namespace}/collector`}>
          <span className={styles.logo}><img src="/branding/sciprospect-a-icon.png" alt="" /></span>
          <span><strong>SciProspect</strong><small>Research intelligence</small></span>
        </a>
        <nav className={styles.nav} aria-label="Data collector">
          <p>Data collector</p>
          <a href="#top" data-active=""><Icon name="bolt" size={18} />Dashboard</a>
          <span className={styles.soon} title="Coming to the web collector soon"><Icon name="doc" size={18} />NIH Grant PIs<em>Soon</em></span>
          <a href="#leads"><Icon name="grid" size={18} />Leads Explorer</a>
          <a href="#datasets"><Icon name="layers" size={18} />Datasets Archive</a>
        </nav>
        <div className={styles.sideFoot}>
          <p>Studio</p>
          <a className={styles.studio} href={`/${namespace}/scistudio`}><Icon name="layers" size={18} /><span><strong>SciStudio</strong><small>Website builder</small></span></a>
          <a className={styles.back} href={`/${namespace}/dashboard`}>← Workspace</a>
        </div>
      </aside>
      <div className={styles.body}>
        <header className={styles.header}>
          <div className={styles.headTitle}><span><Icon name="grid" size={18} /></span><div><h1>Dashboard</h1><small>Research workspace</small></div></div>
          <div className={styles.user}><span className={styles.avatar}><Icon name="user" size={16} /></span><strong>{userName}</strong><em>{tier === "pro" ? "PRO" : "TRIAL"}</em></div>
        </header>
        <main className={styles.main} id="top"><Collector /></main>
        <footer className={styles.footer}><span><i />SciProspect &amp; SciStudio · Cloud Database Connected</span><span>© {new Date().getFullYear()} SciProspect</span></footer>
      </div>
    </div>
  );
}

export function Collector() {
  const [runs,setRuns] = useState<Run[]>([]);
  const [selected,select] = useState("");
  const [offset,setOffset] = useState(0);
  const [rows,setRows] = useState<Contact[]>([]);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [revision,refresh] = useState(0);
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState("");
  const [target, setTarget] = useState(100);
  const [stats, setStats] = useState<Stats | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [now, setNow] = useState(Date.now());
  const checkRequest = useRef<AbortController | null>(null);
  const seen = useRef<Record<string, { status:string; source:string; collected:number; errors:number }>>({});
  const logBox = useRef<HTMLDivElement>(null);
  useEffect(() => () => checkRequest.current?.abort(), []);
  const current = runs.find(run => run.id === selected) ?? runs[0];
  const active = runs.find(run => run.status === "running");
  const watched = active ?? (selected ? runs.find(r => r.id === selected) : undefined);
  const today = new Date().toISOString().slice(0,10);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await api<Run[]>(endpoint,{signal:controller.signal});
        if (!controller.signal.aborted) setRuns(value);
        api<Stats>("/api/collector/stats",{signal:controller.signal}).then(setStats).catch(() => undefined);
      } catch(e) { if (!controller.signal.aborted) setError(message(e)); }
      finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(poll, active ? 2000 : 4000); }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision, active?.id]);

  // Live monitor: turn changes in the watched run into timestamped activity lines.
  useEffect(() => {
    if (!watched) return;
    const prev = seen.current[watched.id];
    const add: LogLine[] = [];
    const at = clock();
    if (!prev) {
      if (watched.status === "running") add.push({ at, level:"info", text:`Starting collection: "${watched.topic}" · target ${watched.target} contacts` });
    } else {
      if (watched.source && watched.source !== prev.source) add.push({ at, level:"info", text:`Searching ${watched.source}…` });
      if (watched.collected > prev.collected) add.push({ at, level:"ok", text:`+${watched.collected - prev.collected} contacts · ${watched.collected} / ${watched.target}` });
      watched.source_errors.slice(prev.errors).forEach(e => add.push({ at, level:"error", text:`${e.source}: ${e.message}` }));
      if (watched.status !== prev.status && watched.status !== "running") {
        const done = watched.status === "completed";
        add.push({ at, level: done ? "ok" : watched.status === "failed" ? "error" : "warn",
          text: done ? `Completed: ${watched.collected} contacts collected. CSV ready in Datasets Archive.`
            : watched.status === "partial" ? `Finished with ${watched.collected} of ${watched.target}: fewer contacts matched the criteria.`
            : watched.status === "failed" ? "Collection failed. Please try again." : `Stopped at ${watched.collected} contacts.` });
      }
    }
    seen.current[watched.id] = { status:watched.status, source:watched.source, collected:watched.collected, errors:watched.source_errors.length };
    if (add.length) setLog(lines => [...lines, ...add].slice(-500));
  }, [watched?.id, watched?.status, watched?.source, watched?.collected, watched?.source_errors.length]);

  useEffect(() => { if (autoScroll && logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; }, [log, autoScroll]);
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active?.id]);

  const id = current?.id;
  const count = current?.collected;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({offset:String(offset), limit:String(pageSize+1)});
    if (deliveryFilter) query.set("delivery_status", deliveryFilter);
    if (id) api<Contact[]>(endpoint + "/" + id + "/results?" + query,{signal:controller.signal})
      .then(value => { if (!controller.signal.aborted) setRows(value); })
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, [id,count,offset,deliveryFilter,revision]);

  async function checkEmails() {
    if (checkRequest.current) return;
    const controller = new AbortController();
    checkRequest.current = controller;
    setChecking(true); setError("");
    setCheckNote("Checking workspace contacts…");
    let after: string | null = "";
    let checked = 0;
    try {
      do {
        let batch: CheckBatch;
        try {
          batch = await api<CheckBatch>("/api/collector/contacts/check", { method:"POST", body:JSON.stringify({after}), signal:controller.signal });
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 429)) throw e;
          setCheckNote(`Checked ${checked} workspace contacts. Continuing in a minute…`);
          await new Promise(resolve => setTimeout(resolve, 60_000));
          continue;
        }
        checked += batch.checked;
        after = batch.next_after;
        setCheckNote(`Checked ${checked} workspace contacts${after ? "…" : "."}`);
        refresh(v => v+1);
      } while (after !== null && !controller.signal.aborted);
    } catch (e) {
      if (!controller.signal.aborted) { setError(message(e)); setCheckNote(`Check stopped after ${checked} contacts.`); }
    } finally {
      checkRequest.current = null;
      if (!controller.signal.aborted) setChecking(false);
    }
  }
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(""); setBusy(true);
    try {
      const {id} = await api<{id:string}>(endpoint,{method:"POST",body:JSON.stringify({
        topic:form.get("topic"), target, min_score:Number(form.get("score")), from_date:form.get("from"), to_date:form.get("to"),
      })});
      setLog(lines => [...lines, { at:clock(), level:"info", text:`Queued collection for "${String(form.get("topic"))}" (${target} contacts)…` }]);
      select(id); setRows([]); setOffset(0); refresh(v => v+1);
    } catch(e) {setError(message(e));} finally {setBusy(false);}
  }
  async function stop() {
    if (!active) return;
    setBusy(true); setError("");
    try { await api(endpoint + "/" + active.id + "/stop",{method:"POST"}); refresh(v => v+1); }
    catch(e) {setError(message(e));} finally {setBusy(false);}
  }

  // Monitor numbers
  const m = watched;
  const started = m ? new Date(m.started_at).getTime() : 0;
  const ended = m ? (m.status === "running" ? now : new Date(m.updated_at).getTime()) : 0;
  const elapsed = m ? Math.max(0, (ended - started) / 1000) : 0;
  const pct = m && m.target ? Math.min(100, (m.collected / m.target) * 100) : 0;
  const speed = m && elapsed > 5 ? m.collected / (elapsed / 60) : 0;
  const eta = m && m.status === "running" && speed > 0 ? ((m.target - m.collected) / speed) * 60 : null;
  const monitorStatus = m ? RUN_LABEL[m.status] ?? m.status : "Idle";

  return <div className={styles.page}>
    <section className={styles.kpis} aria-label="Collector summary">
      <article><header><span>Collected master leads</span><i><Icon name="user" size={18} /></i></header><strong>{stats?.total.toLocaleString() ?? "–"}</strong><p><b>Central archive</b> Lifetime deduplicated contacts</p></article>
      <article><header><span>Today&apos;s collected leads</span><i><Icon name="check" size={18} /></i></header><strong>{stats?.today.toLocaleString() ?? "–"}</strong><p><b>{today}</b> Contacts found in today&apos;s collections</p></article>
      <article><header><span>Datasets</span><i><Icon name="layers" size={18} /></i></header><strong>{stats?.datasets.toLocaleString() ?? "–"}</strong><p><b>Collections</b> Each one is a downloadable CSV</p></article>
    </section>

    <div className={styles.sectionHead}><h2>Collect research contacts</h2><span>Search a topic. Get a contact list.</span></div>
    {error && <p className={styles.alert} role="alert">{error}</p>}

    <div className={styles.grid}>
      <form className={styles.card} onSubmit={start}>
        <div className={styles.cardTop}><span className={styles.kicker}>New collection</span><span className={styles.pill}>OpenAlex + bioRxiv</span></div>
        <h3>Who are you looking for?</h3>
        <p className={styles.muted}>Find research contacts by topic. We take care of discovery, enrichment and duplicates.</p>
        <fieldset disabled={loading || busy || !!active}>
          <div className={styles.inputs}>
            <label>Research topic<input name="topic" placeholder="e.g. cell biology or physical chemistry" maxLength={200} required /></label>
            <label>Contacts to collect<input type="number" min={1} max={50000} value={target} onChange={e => setTarget(Math.max(1, Math.min(50000, Number(e.target.value) || 1)))} required /></label>
          </div>
          <div className={styles.quick}><span>Quick select</span>{[50, 100, 250, 500].map(n => <button key={n} type="button" data-on={target === n || undefined} onClick={() => setTarget(n)}>{n}</button>)}</div>
          <details className={styles.settings}>
            <summary><span>Collection settings</span><small>Score 50+ · Automatic sources</small></summary>
            <div className={styles.filters}>
              <label>From<input name="from" type="date" defaultValue={today.slice(0,4)+"-01-01"} required /></label>
              <label>Through<input name="to" type="date" defaultValue={today} required /></label>
              <label>Minimum score / 100<input name="score" type="number" min="0" max="100" defaultValue="50" required /></label>
            </div>
          </details>
          {!active && <button type="submit" className={styles.go}>{busy ? "Starting…" : `Collect ${target.toLocaleString()} contacts`}</button>}
        </fieldset>
        {active && <button type="button" className={styles.stop} onClick={() => void stop()} disabled={busy}>Stop collection</button>}
        <p className={styles.note}>One click. One clean CSV. Any shortfall is clearly reported.</p>
      </form>

      <aside className={styles.monitor}>
        <div className={styles.monTop}>
          <div className={styles.monTitle}><i data-live={m?.status === "running" || undefined} /><strong>Live Execution Monitor</strong><span className={styles.state} data-state={m?.status ?? "idle"}>{monitorStatus}</span></div>
          <div className={styles.monTools}>
            <label><input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />Auto-scroll</label>
            <button type="button" onClick={() => setLog([])}>Clear</button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(log.map(l => `[${l.at}] ${l.text}`).join("\n"))}>Copy Logs</button>
          </div>
        </div>
        <div className={styles.monStats}>
          <div className={styles.monHead}><span className={styles.pct}>{pct.toFixed(1)}%</span><strong>{m ? `${m.collected} / ${m.target} Contacts` : "0 Leads Discovered"}</strong></div>
          <div className={styles.chips}>
            <span>⚡ Speed: {speed ? `${speed.toFixed(1)} leads/min` : "-- leads/min"}</span>
            <span>⏱ Elapsed: {mmss(elapsed)}</span>
            <span>{m && m.status !== "running" ? `✓ ${monitorStatus}` : `⌛ ETA: ${eta === null ? "Ready" : mmss(eta)}`}</span>
          </div>
          <div className={styles.bar} data-done={m?.status === "completed" || undefined}><i style={{ width:`${pct}%` }} /></div>
        </div>
        <div className={styles.terminal} ref={logBox} aria-live="polite">
          {log.length ? log.map((l, i) => <div key={i} className={styles.line} data-level={l.level}><span>[{l.at}]</span><p>{l.text}</p></div>) : (
            <div className={styles.ready}><b>&gt;_</b><strong>Ready when you are.</strong><small>Enter a topic and start a collection. Live activity will appear here.</small></div>
          )}
        </div>
        <div className={styles.monFoot}><span>{log.length} lines</span><span>Duration: {mmss(elapsed)}</span></div>
      </aside>
    </div>

    <section className={styles.card} id="datasets">
      <div className={styles.cardTop}><h3 className={styles.h3}>Datasets Archive</h3>{current && <a className={styles.download} href={endpoint+"/"+current.id+"/export"} download>Download CSV</a>}</div>
      {current ? <>
        <label className={styles.field}>Dataset<select value={current.id} onChange={e=>{select(e.target.value);setRows([]);setOffset(0);}}>
          {runs.map(r=><option key={r.id} value={r.id}>{r.topic} · {new Date(r.started_at).toLocaleString()} · {RUN_LABEL[r.status] ?? r.status}</option>)}
        </select></label>
        <p className={styles.muted}>{RUN_LABEL[current.status] ?? current.status} · {current.collected} of {current.target} contacts</p>
        {current.status==="partial" && <p className={styles.muted}>{current.shortfall} fewer contacts than requested met the collection criteria.</p>}
        {current.source_errors.map(e=><p key={e.source} className={styles.alert}>{e.source} · {e.message}</p>)}
      </> : <p className={styles.muted}>{loading ? "Loading collections…" : "Your collections will appear here."}</p>}
    </section>

    {current && <section className={styles.card} id="leads">
      <div className={styles.cardTop}><h3 className={styles.h3}>Leads Explorer</h3>
        <div className={styles.leadTools}>
          <label className={styles.field}>Delivery status<select value={deliveryFilter} onChange={e=>{setDeliveryFilter(e.target.value);setOffset(0);}}>
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          <button type="button" className={styles.ghost} onClick={() => void checkEmails()} disabled={checking} title="Checks mail domains across all your datasets">{checking ? "Checking…" : "Check emails"}</button>
        </div>
      </div>
      {checkNote && <p className={styles.muted} role="status">{checkNote}</p>}
      <div className={styles.scroll}><table><thead><tr>{["Researcher","Public email","Affiliation","Source","Email confidence","Delivery status"].map(h=><th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.slice(0,pageSize).map(row=><tr key={row.professional_email}><td>{row.researcher_name}</td><td>{row.professional_email}</td><td>{row.affiliation}</td><td>{row.data_source}</td><td>{row.email_confidence.replaceAll("_"," ")}</td>
          <td><span className={styles.badge} data-status={row.delivery_status}>{statusLabels[row.delivery_status ?? "unknown"] ?? "Unknown"}</span></td></tr>)}
          {rows.length===0 && <tr><td colSpan={6}>No contacts to show.</td></tr>}</tbody></table></div>
      {(offset>0 || rows.length>pageSize) && <div className={styles.pager}><button className={styles.ghost} disabled={!offset} onClick={()=>setOffset(v=>v-pageSize)}>Previous</button><span>Page {offset/pageSize+1}</span><button className={styles.ghost} disabled={rows.length<=pageSize} onClick={()=>setOffset(v=>v+pageSize)}>Next</button></div>}
    </section>}
  </div>;
}
