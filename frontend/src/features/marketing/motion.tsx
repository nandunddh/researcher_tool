"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Page-wide effects: scroll reveals, nav state, the cursor spotlight and the hero screen's tilt. */
export function MotionEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => {
      root.toggleAttribute("data-scrolled", window.scrollY > 8);
      // The hero app screen starts tilted and flattens as you scroll (0 → 1 over the first 500px).
      root.style.setProperty("--tilt", String(Math.min(1, window.scrollY / 500)));
    };
    const onMove = (e: PointerEvent) => {
      root.style.setProperty("--mx", `${e.clientX}px`);
      root.style.setProperty("--my", `${e.clientY}px`);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    let io: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window && !reducedMotion()) {
      io = new IntersectionObserver(entries => {
        for (const e of entries) if (e.isIntersecting) { e.target.setAttribute("data-shown", ""); io?.unobserve(e.target); }
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
      items.forEach(el => io!.observe(el));
    } else items.forEach(el => el.setAttribute("data-shown", ""));
    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      root.removeAttribute("data-scrolled");
    };
  }, []);
  return null;
}

/** Cycles through words in the headline (static for reduced motion). */
export function RotatingWords({ words, className }: { words: string[]; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = window.setInterval(() => setI(n => (n + 1) % words.length), 2600);
    return () => window.clearInterval(t);
  }, [words.length]);
  return <span className={className} key={i}>{words[i]}</span>;
}

/** A live network of "researchers": drifting nodes that link when close and lean towards the cursor. */
export function NetworkCanvas({ className, accent = "#c8ff4d" }: { className?: string; accent?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0, h = 0, raf = 0, running = true;
    const mouse = { x: -9999, y: -9999 };
    // One accent for the hub nodes, quiet white for the rest (no rainbow).
    const colors = ["rgba(255,255,255,.55)", "rgba(255,255,255,.35)", "rgba(255,255,255,.45)"];
    type Node = { x: number; y: number; vx: number; vy: number; r: number; c: string; hub: boolean };
    let nodes: Node[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, Math.max(40, (w * h) / 14000)));
      nodes = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
        r: i % 9 === 0 ? 3 : 1.3 + Math.random() * .8, c: i % 9 === 0 ? accent : colors[i % colors.length], hub: i % 9 === 0,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        const dx = mouse.x - n.x, dy = mouse.y - n.y, d = Math.hypot(dx, dy);
        if (d < 180) { n.vx += dx / d * .012; n.vy += dy / d * .012; }
        n.vx *= .985; n.vy *= .985;
        n.vx += (Math.random() - .5) * .02; n.vy += (Math.random() - .5) * .02;
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 130) { ctx.strokeStyle = `rgba(255,255,255,${(1 - d / 130) * .14})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      for (const n of nodes) {
        if (n.hub) { ctx.fillStyle = "rgba(200,255,77,.12)"; ctx.beginPath(); ctx.arc(n.x, n.y, 10, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = n.c; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
      if (running) raf = requestAnimationFrame(draw);
    };
    const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const onLeave = () => { mouse.x = mouse.y = -9999; };
    const onVisibility = () => { running = !document.hidden && !reducedMotion(); if (running) raf = requestAnimationFrame(draw); else cancelAnimationFrame(raf); };
    resize();
    running = !reducedMotion();
    if (running) raf = requestAnimationFrame(draw); else { running = true; draw(); running = false; }
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

/** Scroll story: the screen on the left stays in place and changes with the step you are reading. */
export function ScrollStory({ steps, screens, classes }: {
  steps: { title: string; text: string; kicker: string }[]; screens: ReactNode[];
  classes: { wrap: string; sticky: string; screen: string; steps: string; step: string; dots: string };
}) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className={classes.wrap}>
      <div className={classes.sticky}>
        {screens.map((s, i) => <div key={i} className={classes.screen} data-active={i === active || undefined} aria-hidden={i !== active}>{s}</div>)}
        <div className={classes.dots} aria-hidden="true">{steps.map((_, i) => <i key={i} data-active={i === active || undefined} />)}</div>
      </div>
      <div className={classes.steps}>
        {steps.map((s, i) => (
          <div key={s.title} ref={el => { refs.current[i] = el; }} data-index={i} className={classes.step} data-active={i === active || undefined}>
            <span>{s.kicker}</span><h3>{s.title}</h3><p>{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
