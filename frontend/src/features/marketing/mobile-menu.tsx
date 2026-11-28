"use client";
import { useEffect, useRef, type ReactNode } from "react";
import s from "./landing.module.css";

/** The header's menu button on tablets and phones. A <details> so it works before scripts load; closes on a link, Escape or a click outside. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => { if (ref.current) ref.current.open = false; };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && ref.current?.open) { close(); ref.current.querySelector("summary")?.focus(); } };
    const onClick = (e: MouseEvent) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);

  return (
    <details ref={ref} className={s.menu} onClick={(e) => { if ((e.target as Element).closest("a") && ref.current) ref.current.open = false; }}>
      <summary aria-label="Menu"><span className={s.burger} aria-hidden="true" /></summary>
      <nav className={s.menuPanel} aria-label="Menu">{children}</nav>
    </details>
  );
}
