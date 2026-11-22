import styles from "./landing.module.css";

export type PublicPlan = { id: string; name: string; price_month: number; limits: Record<string, number | boolean> };

const fmt = (n: unknown, unit = "") => (typeof n === "number" && n < 0 ? "Unlimited" : `${Number(n).toLocaleString()}${unit}`);

function planLines(p: PublicPlan): { text: string; off?: boolean }[] {
  const l = p.limits;
  const storage = typeof l.storage_mb === "number" && l.storage_mb >= 1000 ? `${Math.round(l.storage_mb / 1000)} GB` : `${fmt(l.storage_mb)}${typeof l.storage_mb === "number" && l.storage_mb >= 0 ? " MB" : ""}`;
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
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navInner}`}>
          <a className={styles.brand} href="/"><img src="/branding/sciprospect-a-icon.png" alt="" />SciProspect</a>
          <nav className={styles.links} aria-label="Main">
            <a href="#tools">Tools</a><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
          </nav>
          <div className={styles.actions}>
            {signedInHref ? <a className={styles.btn} href={signedInHref}>Open workspace</a> : <>
              <a className={styles.btnGhost} href="/login">Log in</a>
              <a className={styles.btn} href="/signup">Start free</a>
            </>}
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <span className={styles.eyebrow}>For conferences, research teams and event organisers</span>
              <h1>Find the right researchers. <span>Launch the event website.</span></h1>
              <p className={styles.lead}>SciProspect collects verified researcher contacts from scholarly sources, and SciStudio turns your event into a complete website with registration, payments and abstract submissions. No code needed.</p>
              <div className={styles.heroCtas}>
                <a className={styles.btn} href={signedInHref ?? "/signup"}>{signedInHref ? "Open workspace" : "Start free"}</a>
                <a className={styles.btnGhost} href="#pricing">See pricing</a>
              </div>
              <div className={styles.trust}><span>Free plan, no card</span><span>Set up in minutes</span><span>Your data stays yours</span></div>
            </div>
            <div className={styles.visual} aria-hidden="true">
              <div className={styles.card1}>
                <div className={styles.dots}><i /><i /><i /></div>
                <strong style={{ fontSize: 14 }}>Researcher leads</strong>
                {[["Dr. A. Rao", "Genomics", "Verified"], ["Prof. L. Chen", "Machine learning", "Verified"], ["Dr. M. Okafor", "Neuroscience", "Review"], ["Dr. S. Müller", "Climate science", "Verified"]].map(([n, f, s]) => (
                  <div className={styles.row} key={n}><b>{n}</b><span>{f}</span><span className={s === "Verified" ? styles.ok : styles.chip}>{s}</span></div>
                ))}
              </div>
              <div className={styles.card2}>
                <div className={styles.site}><small>AI &amp; ML Summit 2027</small><strong>Registration is open</strong><small>Early bird ends 31 March</small></div>
                <div className={styles.tickets}><div>Academic<b>$699</b></div><div>Student<b>$499</b></div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="tools" className={`${styles.section} ${styles.alt}`}>
          <div className={styles.wrap}>
            <div className={styles.head}>
              <span className={styles.kicker}>Two tools, one account</span>
              <h2>Everything from finding speakers to welcoming attendees</h2>
              <p>Use them together or on their own. One sign-in, one team, one plan.</p>
            </div>
            <div className={styles.tools}>
              <article className={styles.tool}>
                <div className={styles.toolIcon}>🔎</div>
                <h3>SciProspect</h3>
                <p>The research data collector: find active researchers in your field and their professional contacts.</p>
                <ul>
                  <li>Search publications by topic, then collect the authors</li>
                  <li>Contacts matched to the author from ORCID, Crossref and Europe PMC</li>
                  <li>NIH-funded researcher search</li>
                  <li>Remove duplicates and export to CSV</li>
                </ul>
              </article>
              <article className={styles.tool}>
                <div className={styles.toolIcon}>🎨</div>
                <h3>SciStudio</h3>
                <p>The no-code website builder made for conferences, and great for any website.</p>
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
            <div className={styles.head}><span className={styles.kicker}>How it works</span><h2>Up and running in three steps</h2></div>
            <div className={styles.steps}>
              <div className={styles.step}><h3>Create your account</h3><p>Sign up with your email and pick a plan. The Free plan needs no card.</p></div>
              <div className={styles.step}><h3>Build or collect</h3><p>Start a website from a template, or run a search to collect researcher contacts.</p></div>
              <div className={styles.step}><h3>Publish and grow</h3><p>Publish your site, open registration and invite the right people.</p></div>
            </div>
          </div>
        </section>

        <section id="pricing" className={`${styles.section} ${styles.alt}`}>
          <div className={styles.wrap}>
            <div className={styles.head}><span className={styles.kicker}>Pricing</span><h2>Simple plans that grow with you</h2><p>Start free. Upgrade, downgrade or cancel at any time.</p></div>
            {plans.length ? (
              <div className={styles.plans}>
                {plans.map(p => (
                  <article key={p.id} className={styles.plan} data-popular={p.id === popular || undefined}>
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
            <div className={styles.head}><span className={styles.kicker}>FAQ</span><h2>Questions, answered</h2></div>
            <div className={styles.faq}>
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
            <div className={styles.ctaBox}>
              <h2>Ready to plan your next event?</h2>
              <p>Create your free account in a minute. No card needed.</p>
              <a className={styles.btnLight} href={signedInHref ?? "/signup"}>{signedInHref ? "Open workspace" : "Create free account"}</a>
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
