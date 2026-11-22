"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import styles from "./collector.module.css";

type Run = { id:string; topic:string; status:string; source:string; collected:number; target:number; shortfall:number; updated_at:string; started_at:string; source_errors:{source:string; message:string}[] };
type Contact = { researcher_name:string; professional_email:string; affiliation:string; data_source:string; email_confidence:string };
const endpoint = "/api/collector/runs";
const pageSize = 50;
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

export function Collector({namespace}: {namespace: string}) {
  const [runs,setRuns] = useState<Run[]>([]);
  const [selected,select] = useState("");
  const [offset,setOffset] = useState(0);
  const [rows,setRows] = useState<Contact[]>([]);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [revision,refresh] = useState(0);
  const current = runs.find(run => run.id === selected) ?? runs[0];
  const active = runs.find(run => run.status === "running");
  const today = new Date().toISOString().slice(0,10);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await api<Run[]>(endpoint,{signal:controller.signal});
        if (!controller.signal.aborted) setRuns(value);
      } catch(e) { if (!controller.signal.aborted) setError(message(e)); }
      finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(poll,4000);
        }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  const id = current?.id;
  const count = current?.collected;
  useEffect(() => {
    const controller = new AbortController();
    if (id) api<Contact[]>(endpoint + "/" + id + "/results?offset=" + offset,{signal:controller.signal})
      .then(value => { if (!controller.signal.aborted) setRows(value); })
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, [id,count,offset]);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(""); setBusy(true);
    try {
      const {id} = await api<{id:string}>(endpoint,{method:"POST",body:JSON.stringify({
        topic:form.get("topic"), target:Number(form.get("target")), min_score:Number(form.get("score")),
        from_date:form.get("from"),to_date:form.get("to"),
      })});
      select(id); setRows([]); setOffset(0); refresh(v => v+1);
    } catch(e) {setError(message(e));} finally {setBusy(false);}
  }
  async function stop() {
    if (!active) return;
    setBusy(true); setError("");
    try { await api(endpoint + "/" + active.id + "/stop",{method:"POST"}); refresh(v => v+1); }
    catch(e) {setError(message(e));} finally {setBusy(false);}
  }
  return <main className={styles.page}>
    <header><a href={"/"+namespace+"/dashboard"}>← Workspace</a><h1>Research collector</h1></header>
    {error && <p role="alert">{error}</p>}
    <section><h2>Collect contacts</h2>
      <form onSubmit={start}><fieldset disabled={loading || busy || !!active}>
        <label>Research topic<input name="topic" placeholder="e.g. Materials science" maxLength={200} required /></label>
        <label>Target contacts<input name="target" type="number" min="1" max="50000" defaultValue="100" required /></label>
        <details><summary>Dates and match score</summary><div className={styles.filters}>
          <label>From<input name="from" type="date" defaultValue={today.slice(0,4)+"-01-01"} required /></label>
          <label>Through<input name="to" type="date" defaultValue={today} required /></label>
          <label>Minimum score / 100<input name="score" type="number" min="0" max="100" defaultValue="50" required /></label>
        </div></details>
        <button type="submit" className={styles.primary}>Collect contacts</button>
      </fieldset></form>
      {active && <div className={styles.progress}><div role="status"><strong>{active.topic}</strong> · {active.source || "Starting"} · {active.collected} / {active.target}</div>
        <progress value={active.collected} max={active.target}/><button onClick={stop} disabled={busy}>Stop collection</button></div>}
    </section>
    <section><h2>Collection history</h2>
      {current ? <>
        <label>Dataset<select value={current.id} onChange={e=>{select(e.target.value);setRows([]);setOffset(0);}}>
          {runs.map(r=><option key={r.id} value={r.id}>{r.topic} · {new Date(r.started_at).toLocaleString()}</option>)}
        </select></label>
        <div className={styles.actions}><span>{current.status} · {current.collected} of {current.target} contacts</span>
          <a href={endpoint+"/"+current.id+"/export"} download>Download CSV</a></div>
        {current.status==="partial" && <p>{current.shortfall} fewer contacts than requested met the collection criteria.</p>}
        {current.source_errors.map(e=><p key={e.source}>{e.source} · {e.message}</p>)}
        <div className={styles.scroll}><table><thead><tr>{["Researcher","Public email","Affiliation","Source","Email confidence"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(row=><tr key={row.professional_email}><td>{row.researcher_name}</td><td>{row.professional_email}</td><td>{row.affiliation}</td><td>{row.data_source}</td><td>{row.email_confidence.replaceAll("_"," ")}</td></tr>)}</tbody></table></div>
        {current.collected>pageSize && <div className={styles.actions}><button disabled={!offset} onClick={()=>setOffset(v=>v-pageSize)}>Previous</button><span>{offset+1}–{Math.min(offset+pageSize,current.collected)}</span><button disabled={offset+pageSize>=current.collected} onClick={()=>setOffset(v=>v+pageSize)}>Next</button></div>}
      </> : <p>{loading ? "Loading collections…" : "Your collections will appear here."}</p>}
    </section>
  </main>;
}
