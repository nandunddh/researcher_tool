import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import s from "./dashboard.module.css";

export type Tone = "violet" | "blue" | "teal" | "green" | "amber";

export type WelcomeStat = { label: string; value: ReactNode; hint?: string; progress?: number | null };

/** Top-bar buttons beside sign-out: Upgrade while on a trial or expired, and Account details. */
export function TopActions({ upgrade }: { upgrade: boolean }) {
  return (
    <>
      {upgrade && <a className={s.topUpgrade} href="/billing"><Icon name="bolt" size={15} /> Upgrade plan</a>}
      <a className={s.topAccount} href="/account"><Icon name="user" size={15} /> Account</a>
    </>
  );
}

/** Top banner: greeting with the plan chips beside it, and the account's key figures as compact tiles. */
export function Welcome({ name, subtitle, chips, stats }: {
  name: string; subtitle: string; chips: { text: string; tone?: "lime" | "red" }[]; stats: WelcomeStat[];
}) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <section className={s.welcome} aria-label="Welcome and account summary">
      <div className={s.welcomeTop}>
        <div>
          <h2>Welcome back, {first}</h2>
          <p>{subtitle}</p>
        </div>
        <div className={s.chips}>{chips.map((c) => <span key={c.text} className={s.chip} data-tone={c.tone}>{c.text}</span>)}</div>
      </div>
      <div className={s.tiles}>
        {stats.map((t) => (
          <div key={t.label} className={s.tile}>
            <span className={s.tileLabel}>{t.label}</span>
            <strong className={s.tileValue}>{t.value}</strong>
            {t.hint && <span className={s.tileHint}>{t.hint}</span>}
            {t.progress != null && <div className={s.tileBar} role="progressbar" aria-label={t.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.progress * 100)}><i style={{ width: `${t.progress * 100}%` }} /></div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionTitle({ title, note }: { title: string; note?: string }) {
  return <div className={s.sectionTitle}><h2>{title}</h2>{note && <small>{note}</small>}</div>;
}

export function LaunchGrid({ children }: { children: ReactNode }) {
  return <div className={s.launch}>{children}</div>;
}

/** A workspace to open (Collect, Studio): icon, name, what it does and its button. */
export function LaunchCard({ icon, tone = "violet", eyebrow, title, text, href, cta, disabled = false }: {
  icon: IconName; tone?: Tone; eyebrow: string; title: string; text: string; href: string; cta: string; disabled?: boolean;
}) {
  return (
    <article className={s.launchCard} data-tone={tone}>
      <div className={s.launchTop}>
        <span className={s.launchIcon}><Icon name={icon} size={22} /></span>
        <div><span className={s.launchEyebrow}>{eyebrow}</span><h3>{title}</h3></div>
      </div>
      <p>{text}</p>
      <a href={disabled ? undefined : href} aria-disabled={disabled || undefined}>{cta} <Icon name="next" size={15} /></a>
    </article>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return <div className={s.empty}><span className={s.emptyIcon}><Icon name={icon} size={24} /></span><strong>{title}</strong><p>{text}</p>{action}</div>;
}
