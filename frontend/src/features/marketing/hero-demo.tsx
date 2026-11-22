"use client";
import { useEffect, useState } from "react";
import s from "./hero-demo.module.css";

const QUERY = "single-cell genomics";
const ROWS = [["Dr. Aisha Rao", "Univ. of Toronto", true], ["Prof. Lin Chen", "Tsinghua University", true], ["Dr. Marco Rossi", "University of Milan", false],
  ["Dr. Sara Müller", "ETH Zürich", true], ["Dr. Kofi Mensah", "University of Ghana", true]] as const;

type Phase = "type" | "search" | "rows" | "build" | "site" | "paid";
const STEPS: { id: Phase; label: string }[] = [{ id: "type", label: "Collect" }, { id: "build", label: "Build" }, { id: "paid", label: "Get paid" }];

/** Self-playing product demo in the hero: search → results → website → payment, on a loop. */
export function HeroDemo() {
  const [phase, setPhase] = useState<Phase>("type");
  const [typed, setTyped] = useState(0);
  const [rows, setRows] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setTyped(QUERY.length); setRows(ROWS.length); setPhase("paid"); return; }
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const run = () => {
      setPhase("type"); setTyped(0); setRows(0);
      for (let i = 1; i <= QUERY.length; i++) at(i * 55, () => setTyped(i));
      at(QUERY.length * 55 + 250, () => setPhase("search"));
      at(QUERY.length * 55 + 1100, () => setPhase("rows"));
      for (let i = 1; i <= ROWS.length; i++) at(QUERY.length * 55 + 1100 + i * 260, () => setRows(i));
      at(QUERY.length * 55 + 3000, () => setPhase("build"));
      at(QUERY.length * 55 + 3900, () => setPhase("site"));
      at(QUERY.length * 55 + 5700, () => setPhase("paid"));
      at(QUERY.length * 55 + 9200, run);
    };
    run();
    return () => timers.forEach(t => window.clearTimeout(t));
  }, []);

  const active = phase === "type" || phase === "search" || phase === "rows" ? "type" : phase === "build" || phase === "site" ? "build" : "paid";
  const showSite = phase === "site" || phase === "paid";
  return (
    <div className={s.demo} aria-label="Product demo: collect researchers, build the event website, take payments">
      <div className={s.bar}>
        <span className={s.dots}><i /><i /><i /></span>
        <div className={s.tabs}>{STEPS.map(t => <span key={t.id} data-on={t.id === active || undefined}>{t.label}</span>)}</div>
        <span className={s.url}>{showSite ? "ai-ml-summit.sciprospect.site" : "app.sciprospect.com"}</span>
      </div>

      <div className={s.body}>
        {/* Collect */}
        <div className={s.pane} data-on={!showSite || undefined}>
          <div className={s.search}>
            <span className={s.icon}>⌕</span>
            <span>{QUERY.slice(0, typed)}<i className={s.caret} /></span>
            <b data-on={phase === "search" || undefined}>{phase === "search" ? "Searching OpenAlex…" : rows ? `${rows} researchers` : ""}</b>
          </div>
          <div className={s.table}>
            <div className={s.th}><span>Researcher</span><span>Institution</span><span>Email</span></div>
            {ROWS.map(([name, org, ok], i) => (
              <div key={name} className={s.tr} data-on={i < rows || undefined}>
                <span><em>{name.split(" ").slice(-1)[0][0]}</em>{name}</span><span>{org}</span>
                <span className={ok ? s.ok : s.review}>{ok ? "✓ Matched" : "Review"}</span>
              </div>
            ))}
          </div>
          <button type="button" tabIndex={-1} className={s.cta} data-press={phase === "build" || undefined}>Create event website →</button>
        </div>

        {/* Build + paid */}
        <div className={s.pane} data-on={showSite || undefined}>
          <div className={s.site}>
            <div className={s.siteNav}><b>AI&amp;ML Summit</b><span>Program</span><span>Speakers</span><span className={s.reg}>Register</span></div>
            <div className={s.siteHero}>
              <small>LISBON · 12–14 JUNE 2027</small>
              <h4>Where ideas<br />meet people.</h4>
              <div className={s.tickets}>
                <div data-on><span>Academic</span><b>$699</b></div>
                <div><span>Student</span><b>$499</b></div>
                <div><span>Virtual</span><b>$399</b></div>
              </div>
            </div>
          </div>
          <div className={s.toast} data-on={phase === "paid" || undefined}>
            <span className={s.check}>✓</span>
            <div><b>Payment received · $699</b><small>Receipt AIML-2027-0042 emailed</small></div>
          </div>
        </div>
      </div>
    </div>
  );
}
