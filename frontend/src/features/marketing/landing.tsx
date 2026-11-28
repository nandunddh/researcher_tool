import type { CSSProperties } from "react";
import { MarketingFooter, MarketingHeader } from "./site-chrome";
import { Icon } from "@/components/icon";
import { MotionEffects, RotatingWords, ScrollStory } from "./motion";
import { HeroDemo } from "./hero-demo";
import { Pricing } from "./pricing";
import type { PublicPlan } from "@/lib/plans";
import s from "./landing.module.css";

export type { PublicPlan } from "@/lib/plans";

const delay = (sec: number) => ({ "--d": `${sec}s` }) as CSSProperties;
const SOURCES = ["OpenAlex", "ORCID", "Crossref", "Europe PMC", "NIH RePORTER"];

/* ---------- product screens (drawn in HTML so they stay sharp and light) ---------- */
function Chrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className={s.app}>
      <div className={s.appBar}><i /><i /><i /><span>{url}</span></div>
      <div className={s.appBody}>{children}</div>
    </div>
  );
}

const LEADS = [["Dr. Aisha Rao", "Single-cell genomics", "Univ. of Toronto", true], ["Prof. Lin Chen", "Machine learning", "Tsinghua Univ.", true],
  ["Dr. Marco Rossi", "Neuroimaging", "Univ. of Milan", false], ["Dr. Sara Müller", "Climate modelling", "ETH Zürich", true], ["Dr. Kofi Mensah", "Epidemiology", "Univ. of Ghana", true]] as const;

function CollectScreen() {
  return (
    <Chrome url="app.sciprospect.com/collector">
      <div className={s.search}><Icon name="search" size={16} />single-cell genomics<b>Searching OpenAlex…</b></div>
      <div className={s.progress}><i /></div>
      <div className={s.leads}>
        {LEADS.map(([name, field, org, ok], i) => (
          <div key={name} className={s.leadRow} style={delay(i * .12)}>
            <span className={s.avatar}>{name.split(" ").slice(-1)[0][0]}</span>
            <div><b>{name}</b><small>{field} · {org}</small></div>
            <em data-ok={ok || undefined}>{ok ? "✓ Email matched" : "Needs review"}</em>
          </div>
        ))}
      </div>
    </Chrome>
  );
}

function BuildScreen() {
  return (
    <Chrome url="app.sciprospect.com/studio">
      <div className={s.editor}>
        <aside><b>Add</b><span>Hero</span><span className={s.dragging}>Registration ✥</span><span>Speakers</span><span>Key dates</span><span>Abstracts</span></aside>
        <div className={s.canvas}>
          <div className={s.siteHero}><small>AI &amp; ML SUMMIT 2027 · LISBON</small><strong>Where ideas meet</strong><span>Register now</span></div>
          <div className={s.dropZone}>Drop here to place the section</div>
          <div className={s.speakers}><i /><i /><i /><i /></div>
        </div>
      </div>
    </Chrome>
  );
}

function PayScreen() {
  return (
    <Chrome url="ai-ml-summit.sciprospect.site/register">
      <div className={s.pay}>
        <div className={s.ticketList}>
          <div data-on><b>Academic</b><span>Early bird</span><strong>$699</strong></div>
          <div><b>Student</b><span>Early bird</span><strong>$499</strong></div>
          <div><b>Gala dinner</b><span>Add-on</span><strong>$80</strong></div>
        </div>
        <div className={s.receipt}>
          <span className={s.paidStamp}>PAID</span>
          <small>RECEIPT</small><strong>AIML-2027-0042</strong>
          <p><span>Academic (Early bird)</span><span>$699</span></p>
          <p><span>Discount EARLY10</span><span>−$69.90</span></p>
          <p className={s.total}><span>Total</span><span>$629.10</span></p>
          <em>✉ Emailed to the attendee</em>
        </div>
      </div>
    </Chrome>
  );
}

/** Public home page. */
export function Landing({ plans, signedInHref }: { plans: PublicPlan[]; signedInHref: string | null }) {
  const start = signedInHref ?? "/signup";
  return (
    <div className={s.page}>
      <MotionEffects />
      <div className={s.spotlight} data-spotlight="" aria-hidden="true" />

      <MarketingHeader label="Main" signedInHref={signedInHref} links={[["#story", "Product"], ["#features", "Features"], ["#pricing", "Pricing"], ["#faq", "FAQ"]]} />

      <main>
        {/* ---------- Hero ---------- */}
        <section className={s.hero}>
          <div className={s.dotGrid} aria-hidden="true" />
          <div className={`${s.wrap} ${s.heroInner}`}>
            <a className={s.pill} href="#story"><b>New</b> Registration, payments &amp; receipts, built in <span>→</span></a>
            <h1 className={s.title}>
              <span className={s.line}>Find the <mark className={s.mark}>minds.</mark></span>
              <span className={s.line}>Build the event.</span>
            </h1>
            <p className={s.lead}>
              SciProspect finds the researchers your event needs, then gives you{" "}
              <RotatingWords article className={s.rotate} words={["conference website", "registration desk", "abstract portal", "speaker line-up"]} />
              {" "}in minutes. No code.
            </p>
            <div className={s.ctas}>
              <a className={s.btn} href={start}>{signedInHref ? "Open workspace" : "Start free trial"} <span className={s.arrow}>→</span></a>
              <a className={s.btnGhost} href={signedInHref ? "#story" : "/demo"}>{signedInHref ? "See how it works" : "Book a demo"}</a>
            </div>
            <ul className={s.facts}><li>7-day free trial, no card</li><li>Verified researcher emails</li><li>Payments &amp; receipts</li></ul>
          </div>
          <div className={`${s.wrap} ${s.heroScreen}`}>
            <div className={s.tilt}><HeroDemo /></div>
          </div>
        </section>

        <section className={s.sources} aria-label="Researcher data sources">
          <p>Researcher data from trusted scholarly sources</p>
          <div className={s.marquee}><div className={s.track}>{[...SOURCES, ...SOURCES, ...SOURCES, ...SOURCES].map((x, i) => <span key={i} aria-hidden={i >= SOURCES.length || undefined}>{x}</span>)}</div></div>
        </section>

        {/* ---------- Scroll story ---------- */}
        <section id="story" className={s.section}>
          <div className={s.wrap}>
            <div className={s.head} data-reveal=""><span className={s.kicker}>One flow, start to finish</span><h2>From a blank page to a sold-out conference</h2></div>
            <ScrollStory
              classes={{ wrap: s.story, sticky: s.storySticky, screen: s.storyScreen, steps: s.storySteps, step: s.storyStep, dots: s.storyDots, inline: s.storyInline }}
              screens={[<CollectScreen key="c" />, <BuildScreen key="b" />, <PayScreen key="p" />]}
              steps={[
                { kicker: "01 · SciProspect", title: "Collect the right researchers", text: "Search publications by topic. SciProspect gathers the authors and keeps an email only when it matches the person, using ORCID, Crossref and Europe PMC. Remove duplicates and export in one click." },
                { kicker: "02 · SciStudio", title: "Build your event website", text: "Start from a template or a blank canvas. Drag in sections such as registration, speakers, key dates and abstract submission, then edit everything right on the page." },
                { kicker: "03 · Registration", title: "Get registered and get paid", text: "Ticket types, price periods, add-ons and discount codes come from one Event details page. Attendees pay online and get a numbered receipt by email." },
              ]}
            />
          </div>
        </section>

        {/* ---------- Bento ---------- */}
        <section id="features" className={s.section}>
          <div className={s.wrap}>
            <div className={s.head} data-reveal=""><span className={s.kicker}>Everything in one place</span><h2>Built for people who run research events</h2></div>
            <div className={s.bento}>
              {/* 3 columns: [wide, 1] [1, wide] [1, wide] fill every slot; tablets show 3 rows of 2 (CSS). */}
              <article className={`${s.tile} ${s.tileWide}`} data-reveal=""><span className={s.tileIcon}><Icon name="users" size={22} /></span><h3>Verified researcher contacts</h3><p>Emails are matched to the author before they are kept, and each lead shows its source and review status.</p><div className={s.miniChart} aria-hidden="true">{[38, 62, 48, 80, 66, 92, 74].map((v, i) => <i key={i} style={{ height: `${v}%`, ...delay(i * .08) }} />)}</div></article>
              <article className={s.tile} data-reveal="" style={delay(.08)}><span className={s.tileIcon}><Icon name="calendar" size={22} /></span><h3>Event details, once</h3><p>Dates, tickets, prices, codes and speakers in one place. Every page updates.</p></article>
              <article className={s.tile} data-reveal="" style={delay(.16)}><span className={s.tileIcon}><Icon name="doc" size={22} /></span><h3>Abstract submission</h3><p>Authors, tracks, word limits, PDF uploads and IDs like ABS-0001, with review status.</p></article>
              <article className={`${s.tile} ${s.tileWide}`} data-reveal="" style={delay(.16)}><span className={s.tileIcon}><Icon name="palette" size={22} /></span><h3>A design library that grows every day</h3><p>New sections and multi-page templates are added all the time. Use them with one click and make them yours.</p><div className={s.swatches} aria-hidden="true"><i /><i /><i /><i /><i /></div></article>
              <article className={s.tile} data-reveal="" style={delay(.08)}><span className={s.tileIcon}><Icon name="receipt" size={22} /></span><h3>Receipts that send themselves</h3><p>Numbered, with your tax details, ready to print as PDF.</p></article>
              <article className={`${s.tile} ${s.tileWide}`} data-reveal="" style={delay(.08)}><span className={s.tileIcon}><Icon name="lock" size={22} /></span><h3>Secure by default</h3><p>Two-step sign-in, private uploads and server-side prices.</p></article>
            </div>
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section id="pricing" className={s.section}>
          <div className={s.wrap}>
            <div className={s.head} data-reveal=""><span className={s.kicker}>Pricing</span><h2>Simple plans that grow with you</h2><p>Start with a 7-day free trial. Change or cancel your plan at any time.</p></div>
            <Pricing plans={plans} signedIn={!!signedInHref} compareHref="/pricing#comparison" />
            <p className={s.note}>Prices in USD. Running something bigger? <a href="/demo">Book a demo</a>.</p>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className={s.section}>
          <div className={s.wrap}>
            <div className={s.head} data-reveal=""><span className={s.kicker}>FAQ</span><h2>Questions, answered</h2></div>
            <div className={s.faq} data-reveal="">
              <details><summary>Do I need to know how to code?</summary><p>No. Choose a template, edit text and images right on the page, and publish.</p></details>
              <details><summary>Can I take payments for registrations?</summary><p>Yes. Set tickets, price periods, add-ons and codes once; attendees pay online and get a numbered receipt by email.</p></details>
              <details><summary>Can I change or cancel my plan?</summary><p>Yes, at any time from Billing in your workspace.</p></details>
              <details><summary>Where do researcher contacts come from?</summary><p>From public scholarly sources such as OpenAlex, ORCID, Crossref, Europe PMC and NIH RePORTER. An email is kept only when it matches the author.</p></details>
              <details><summary>Can my team work with me?</summary><p>Yes. Invite team members to your organization; seats depend on your plan.</p></details>
            </div>
          </div>
        </section>

        <section className={s.cta}>
          <div className={s.wrap}>
            <div className={s.ctaBox} data-reveal="">
              <h2>Your next event starts here.</h2>
              <p>Start your 7-day free trial in a minute. No card needed. Or see it first with our team.</p>
              <div className={s.ctas}>
                <a className={s.btnLight} href={start}>{signedInHref ? "Open workspace" : "Start free trial"} <span className={s.arrow}>→</span></a>
                {!signedInHref && <a className={s.btnGhost} href="/demo">Book a demo</a>}
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter links={[["#pricing", "Pricing"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/login", "Log in"], ["/signup", "Sign up"]]} />
    </div>
  );
}
