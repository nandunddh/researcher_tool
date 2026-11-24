import type { ReactNode } from "react";
import { BrandText } from "@/components/brand-text";
import s from "./legal.module.css";

/** Company details shown in the legal pages. Fill these in before launch. */
export const COMPANY = {
  name: "SciProspect",            // TODO: legal company name
  address: "[Company address]",   // TODO: registered address
  email: "hello@sciprospect.com", // TODO: legal / privacy contact
  updated: "22 November 2026",
};

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className={s.page}>
      <header className={s.nav}>
        <div className={s.wrap}>
          <a className={s.brand} href="/"><img src="/branding/sciprospect-a-icon-lime.png" alt="" /><BrandText /></a>
          <nav><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a className={s.cta} href="/signup">Start free</a></nav>
        </div>
      </header>
      <main className={s.wrap}>
        <article className={s.doc}>
          <p className={s.kicker}>Last updated {COMPANY.updated}</p>
          <h1>{title}</h1>
          <p className={s.intro}>{intro}</p>
          {children}
        </article>
      </main>
      <footer className={s.footer}><div className={s.wrap}><span>© {new Date().getFullYear()} {COMPANY.name}</span><span><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/">Home</a></span></div></footer>
    </div>
  );
}
