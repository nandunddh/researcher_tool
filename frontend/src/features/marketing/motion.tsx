"use client";
import { useEffect, useState } from "react";

/** Reveals [data-reveal] elements as they scroll into view and marks the nav once the page scrolls. */
export function MotionEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => root.toggleAttribute("data-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) { items.forEach(el => el.setAttribute("data-shown", "")); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.setAttribute("data-shown", ""); io.unobserve(e.target); }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach(el => io.observe(el));
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); root.removeAttribute("data-scrolled"); };
  }, []);
  return null;
}

/** Cycles through words in the headline (static for people who prefer reduced motion). */
export function RotatingWords({ words, className }: { words: string[]; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI(n => (n + 1) % words.length), 2600);
    return () => window.clearInterval(t);
  }, [words.length]);
  return <span className={className} key={i} aria-live="polite">{words[i]}</span>;
}
