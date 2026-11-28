import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "./site-chrome";
import { MotionEffects } from "./motion";
import land from "./landing.module.css";
import s from "./legal.module.css";

/** Company details shown in the legal pages. Leave address empty until the business is registered; the line is then left out. */
export const COMPANY = {
  name: "SciProspect",
  address: "",
  updated: "28 November 2026",
};

export type Contact = { email: string; phone: string };

/** The team's public email and phone from the backend (SCIPROSPECT_CONTACT_EMAIL / _PHONE), the same ones the emails show. */
export async function publicContact(): Promise<Contact> {
  try {
    const origin = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";
    const response = await fetch(origin + "/api/public/contact", { cache: "no-store" });
    const body = response.ok ? await response.json() : {};
    return { email: String(body.email || ""), phone: String(body.phone || "") };
  } catch {
    return { email: "", phone: "" };  // the pages then point to the contact form
  }
}

/** How to reach us: the email when one is set, otherwise the Book a demo form. */
export function ContactLink({ contact }: { contact: Contact }) {
  return contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <a href="/demo">our contact form</a>;
}

/** The closing "Contact" paragraph: name, address when there is one, email and phone. */
export function ContactDetails({ contact }: { contact: Contact }) {
  return (
    <p>
      {COMPANY.name}{COMPANY.address && `, ${COMPANY.address}`}. Email: <ContactLink contact={contact} />
      {contact.phone && <>. Phone: <a href={`tel:${contact.phone.replace(/\s+/g, "")}`}>{contact.phone}</a></>}.
    </p>
  );
}

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className={land.page}>
      <MotionEffects />
      <MarketingHeader label="Legal" signedInHref={null} links={[["/#features", "Features"], ["/pricing", "Pricing"], ["/terms", "Terms"], ["/privacy", "Privacy"]]} />
      <main className={`${s.page} ${s.wrap}`}>
        <article className={s.doc}>
          <p className={s.kicker}>Last updated {COMPANY.updated}</p>
          <h1>{title}</h1>
          <p className={s.intro}>{intro}</p>
          {children}
        </article>
      </main>
      <MarketingFooter links={[["/", "Home"], ["/pricing", "Pricing"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/login", "Log in"]]} />
    </div>
  );
}
