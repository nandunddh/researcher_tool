import { BrandText } from "@/components/brand-text";
import { MobileMenu } from "./mobile-menu";
import s from "./landing.module.css";

export type NavLink = [href: string, label: string];

/** The public pages' top bar: logo, page links, and log in / book a demo / free trial (or "Open workspace" when signed in).
 *  Below 1000px the page links move into a menu; below 640px the buttons do too. */
export function MarketingHeader({ links, label, signedInHref, showDemo = true }: { links: NavLink[]; label: string; signedInHref: string | null; showDemo?: boolean }) {
  const start = signedInHref
    ? <a className={s.btn} href={signedInHref}>Open workspace <span className={s.arrow}>→</span></a>
    : <a className={s.btn} href="/signup">Start free trial <span className={s.arrow}>→</span></a>;
  return (
    <header className={s.nav}>
      <div className={`${s.wrap} ${s.navInner}`}>
        <a className={s.brand} href="/"><img src="/branding/sciprospect-a-icon-lime.png" alt="" /><BrandText /></a>
        <nav className={s.links} aria-label={label}>{links.map(([href, text]) => <a key={href} href={href}>{text}</a>)}</nav>
        <div className={s.actions}>
          {!signedInHref && <a className={s.btnGhost} href="/login">Log in</a>}
          {!signedInHref && showDemo && <a className={`${s.btnGhost} ${s.demoLink}`} href="/demo">Book a demo</a>}
          {start}
        </div>
        <MobileMenu>
          {links.map(([href, text]) => <a key={href} href={href}>{text}</a>)}
          <hr />
          {!signedInHref && <a className={s.menuPhone} href="/login">Log in</a>}
          {!signedInHref && showDemo && <a href="/demo">Book a demo</a>}
          <span className={s.menuPhone}>{start}</span>
        </MobileMenu>
      </div>
    </header>
  );
}

/** The public pages' footer. */
export function MarketingFooter({ links }: { links: NavLink[] }) {
  return (
    <footer className={s.footer}>
      <div className={s.wrap}>
        <span>© {new Date().getFullYear()} SciProspect</span>
        <span>{links.map(([href, text]) => <a key={href} href={href}>{text}</a>)}</span>
      </div>
    </footer>
  );
}
