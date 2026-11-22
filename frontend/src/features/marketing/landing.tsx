import type { CSSProperties } from "react";
import { MotionEffects, RotatingWords } from "./motion";
import styles from "./landing.module.css";

export type PublicPlan = { id: string; name: string; price_month: number; limits: Record<string, number | boolean> };

const fmt = (n: unknown) => (typeof n === "number" && n < 0 ? "Unlimited" : Number(n).toLocaleString());
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;
const SOURCES = ["OpenAlex", "ORCID", "Crossref", "Europe PMC", "NIH RePORTER"];

function planLines(p: PublicPlan): { text: string; off?: boolean }[] {
  const l = p.limits, mb = Number(l.storage_mb);
  const storage = mb < 0 ? "Unlimited" : mb >= 1000 ? `${Math.round(mb / 1000)} GB` : `${mb} MB`;
  return [
    { text: `${fmt(l.websites)} website${l.websites === 1 ? "" : "s"}` },
    { text: `${fmt(l.pages)} pages per website` },
    { text: Number(l.members) === 0 ? "Just you" : `${fmt(l.members)} team members` },
    { text: `${storage} image storage` },
    { text: `${fmt(l.submissions_month)} form submissions / month` },
    { text: "Registration, payments & receipts" },
    { text: "Custom domain", off: l.custom_domain !== true },
  ];
}

/** Public home page: what the tools do, live pricing, sign up / log in. */
export function Landing({ plans, signedInHref }: { plans: PublicPlan[]; signedInHref: string | null }) {
  const popular = plans.length > 2 ? plans[1].id : plans.find(p => p.price_month > 0)?.id;
  const start = signedInHref ?? "/signup";
  return (
    <div className={styles.page}>
      <MotionEffects />
      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navInner}`}>
          <a className={styles.brand} href="/"><img src="/branding/sciprospect-a-icon.png" alt="" />SciProspect</a>
          <nav className={styles.links} aria-label="Main">
            <a href="#tools">Tools</a><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
          </nav>
          <div className={styles.actions}>
            {signedInHref ? <a className={styles.btn} href={signedInHref}>Open workspace <span className={styles.arrow}>→</span></a> : <>
              <a className={styles.btnGhost} href="/login">Log in</a>
              <a className={styles.btn} href="/signup">Start free <span className={styles.arrow}>→</span></a>
            </>}
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.blobs} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.grid} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <span className={styles.eyebrow}><b>NEW</b> Registration, payments and receipts built in</span>
              <h1>
                Find the right researchers.<br />
                Launch your <RotatingWords className={`${styles.gradientText} ${styles.word}`} words={["conference website", "registration desk", "abstract portal", "speaker line-up"]} />
              </h1>
              <p className={styles.lead}>SciProspect collects verified researcher contacts from scholarly sources, and SciStudio turns your event into a complete website with registration, payments and abstract submissions. No code needed.</p>
              <div className={styles.heroCtas}>
                <a className={styles.btn} href={start}>{signedInHref ? "Open workspace" : "Start free"} <span className={styles.arrow}>→</span></a>
                <a className={styles.btnGhost} href="#pricing">See pricing</a>
              </div>
              <div className={styles.trust}><span>Free plan, no card</span><span>Set up in minutes</span><span>Your data stays yours</span></div>
            </div>
            <div className={styles.visual} aria-hidden="true">
              <div className={styles.card1}>
                <div className={styles.cardHead}><strong>Researcher leads</strong><span className={styles.live}>Collecting</span></div>
                {[["Dr. A. Rao", "Genomics", "Verified"], ["Prof. L. Chen", "Machine learning", "Verified"], ["Dr. M. Okafor", "Neuroscience", "Review"], ["Dr. S. Müller", "Climate science", "Verified"]].map(([n, f, s]) => (
                  <div className={styles.row} key={n}><b>{n}</b><span>{f}</span><span className={s === "Verified" ? styles.ok : styles.chip}>{s}</span></div>
                ))}
              </div>
              <div className={styles.card2}>
                <div className={styles.site}><small>AI &amp; ML Summit 2027</small><strong>Registration is open</strong><small>Early bird ends 31 March</small></div>
                <div className={styles.tickets}><div>Academic<b>$699</b></div><div>Student<b>$499</b></div></div>
              </div>
              <div className={styles.card3}><i>✓</i><span>Payment received<small>Receipt R-0042 emailed</small></span></div>
            </div>
          </div>
        </section>

        <section className={styles.sources} aria-label="Researcher data sources">
          <p>Researcher data from trusted scholarly sources</p>
          <div className={styles.marquee}>
            <div className={styles.track}>{[...SOURCES, ...SOURCES, ...SOURCES, ...SOURCES].map((s, i) => <span key={i} aria-hidden={i >= SOURCES.length || undefined}>{s}</span>)}</div>
          </div>
        </section>

        <section id="tools" className={`${styles.section} ${styles.alt}`}>
          <div className={styles.wrap}>
            <div className={styles.head} data-reveal="">
              <span className={styles.kicker}>Two tools, one account</span>
              <h2>Everything from finding speakers to welcoming attendees</h2>
              <p>Use them together or on their own. One sign-in, one team, one plan.</p>
            </div>
            <div className={styles.tools}>
              <article className={styles.tool} data-reveal="">
                <div className={styles.toolIcon}>🔎</div>
                <h3>SciProspect<small>Research data collector</small></h3>
                <p>Find active researchers in your field and their professional contacts.</p>
                <ul>
                  <li>Search publications by topic, then collect the authors</li>
                  <li>Contacts matched to the author from ORCID, Crossref and Europe PMC</li>
                  <li>NIH-funded researcher search</li>
                  <li>Remove duplicates and export to CSV</li>
                </ul>
              </article>
              <article className={styles.tool} data-reveal="" style={delay(.12)}>
                <div className={styles.toolIcon}>🎨</div>
                <h3>SciStudio<small>No-code website builder</small></h3>
                <p>Made for conferences, and great for any website.</p>
                <ul>
                  <li>Drag-and-drop editor, templates and a growing design library</li>
                  <li>Registration with ticket types, price periods, add-ons and discount codes</li>
                  <li>Online payments and automatic, numbered receipts</li>
                  <li>Abstract submission with files, authors and review status</li>
                  <li>Speakers, key dates and event details kept in one place</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="how" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.head} data-reveal=""><span className={styles.kicker}>How it works</span><h2>Up and running in three steps</h2></div>
            <div className={styles.steps}>
              <div className={styles.step} data-reveal=""><h3>Create your account</h3><p>Sign up with your email and pick a plan. The Free plan needs no card.</p></div>
              <div className={styles.step} data-reveal="" style={delay(.12)}><h3>Build or collect</h3><p>Start a website from a template, or run a search to collect researcher contacts.</p></div>
              <div className={styles.step} data-reveal="" style={delay(.24)}><h3>Publish and grow</h3><p>Publish your site, open registration and invite the right people.</p></div>
            </div>
          </div>
        </section>

        <section id="pricing" className={`${styles.section} ${styles.alt}`}>
          <div className={styles.wrap}>
            <div className={styles.head} data-reveal=""><span className={styles.kicker}>Pricing</span><h2>Simple plans that grow with you</h2><p>Start free. Upgrade, downgrade or cancel at any time.</p></div>
            {plans.length ? (
              <div className={styles.plans}>
                {plans.map((p, i) => (
                  <article key={p.id} className={styles.plan} data-popular={p.id === popular || undefined} data-reveal="" style={delay(i * .1)}>
                    {p.id === popular && <span className={styles.popular}>Most popular</span>}
                    <h3>{p.name}</h3>
                    <div className={styles.price}>{p.price_month > 0 ? `$${p.price_month.toLocaleString()}` : "Free"}{p.price_month > 0 && <small> / month</small>}</div>
                    <ul>{planLines(p).map(line => <li key={line.text} data-off={line.off || undefined}>{line.text}</li>)}</ul>
                    <a className={p.id === popular ? styles.btn : styles.btnGhost} href={`/signup?plan=${encodeURIComponent(p.id)}`}>
                      {p.price_month > 0 ? `Choose ${p.name}` : "Start free"}
                    </a>
                  </article>
                ))}
              </div>
            ) : <p className={styles.note}>Plans are being updated. Please check back soon.</p>}
            <p className={styles.note}>Prices in USD. Need more? <a href="mailto:hello@sciprospect.com">Talk to us</a> about larger events.</p>
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.head} data-reveal=""><span className={styles.kicker}>FAQ</span><h2>Questions, answered</h2></div>
            <div className={styles.faq} data-reveal="">
              <details><summary>Do I need to know how to code?</summary><p>No. Everything is point and click: choose a template, edit text and images on the page, and publish.</p></details>
              <details><summary>Can I take payments for registrations?</summary><p>Yes. Set ticket types, price periods, add-ons and discount codes once, and attendees pay online. Each payment gets a numbered receipt by email.</p></details>
              <details><summary>Can I change or cancel my plan?</summary><p>Yes, at any time from Billing in your workspace. Changes apply straight away.</p></details>
              <details><summary>Where do researcher contacts come from?</summary><p>From public scholarly sources such as OpenAlex, ORCID, Crossref, Europe PMC and NIH. An email is kept only when it matches the author.</p></details>
              <details><summary>Can my team work with me?</summary><p>Yes. Invite team members to your organization; the number of seats depends on your plan.</p></details>
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <div className={styles.wrap}>
            <div className={styles.ctaBox} data-reveal="">
              <h2>Ready to plan your next event?</h2>
              <p>Create your free account in a minute. No card needed.</p>
              <a className={styles.btnLight} href={start}>{signedInHref ? "Open workspace" : "Create free account"} <span className={styles.arrow}>→</span></a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <span>© {new Date().getFullYear()} SciProspect. All rights reserved.</span>
          <span><a href="#pricing">Pricing</a><a href="/login">Log in</a><a href="/signup">Sign up</a></span>
        </div>
      </footer>
    </div>
  );
}
