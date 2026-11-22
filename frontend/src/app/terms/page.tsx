import type { Metadata } from "next";
import { COMPANY, LegalPage } from "@/features/marketing/legal";

export const metadata: Metadata = { title: "Terms of service · SciProspect", description: "The terms for using SciProspect and SciStudio." };

// Draft terms written for how SciProspect works. Have them reviewed by a lawyer before launch.
export default function Page() {
  return (
    <LegalPage title="Terms of service" intro={`These terms are an agreement between you and ${COMPANY.name} for using SciProspect (the research data collector) and SciStudio (the website builder). By creating an account you accept them.`}>
      <h2>1. Your account</h2>
      <ul>
        <li>You must give accurate details and keep your password and two-step sign-in device safe. You are responsible for what happens in your account.</li>
        <li>An organization account may add team members. The account owner is responsible for their use and for removing people who should no longer have access.</li>
        <li>You must be at least 18 and able to enter into contracts, or use SciProspect on behalf of an organization that allows you to.</li>
      </ul>

      <h2>2. Plans, payments and cancellation</h2>
      <ul>
        <li>Paid plans are billed monthly in advance, at the price shown when you subscribe. Prices may change with 30 days&apos; notice; the new price applies from your next period.</li>
        <li>You can upgrade, switch or cancel at any time from Billing. If you cancel, your plan stays active until the end of the paid period and then moves to Free.</li>
        <li>Payments are handled by our payment provider. We do not store your full card details.</li>
        <li>Fees already paid are not refunded, except where the law requires it.</li>
        <li>If a payment fails or the plan&apos;s limits are exceeded, some features may be paused until it is resolved.</li>
      </ul>

      <h2>3. Websites you build and visitors&apos; data</h2>
      <ul>
        <li>You own the content you add to your websites. You give us the rights needed to host and display it.</li>
        <li>When your website collects registrations, payments, messages or abstracts, <strong>you are responsible for that data</strong> (the &ldquo;controller&rdquo;), and we process it on your behalf to run the service. You must have a lawful basis to collect it and show your visitors your own privacy notice.</li>
        <li>Registration payments on your websites are between you and your attendees. You are responsible for your event, prices, refunds and taxes.</li>
      </ul>

      <h2>4. Researcher data (SciProspect)</h2>
      <ul>
        <li>The data collector gathers information from public scholarly sources (such as OpenAlex, ORCID, Crossref, Europe PMC and NIH RePORTER).</li>
        <li>You may use it only for legitimate professional purposes, such as inviting researchers to speak at or attend an event. You must follow data protection and anti-spam laws when you contact people, including honouring opt-out and removal requests.</li>
        <li>We do not guarantee that collected data is complete or correct.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You must not use SciProspect to send spam, break the law, infringe others&apos; rights, upload malware, attack or overload the service, resell it without permission, or collect data in ways that break the sources&apos; terms. We may suspend accounts that do.</p>

      <h2>6. Availability and changes</h2>
      <p>We work to keep the service available and secure, but we provide it &ldquo;as is&rdquo; and cannot promise it will always be uninterrupted or error-free. We may improve or change features; if we remove something important to a paid plan, we will tell you in advance.</p>

      <h2>7. Liability</h2>
      <p>To the extent the law allows, we are not liable for indirect or consequential losses, lost profits or lost data, and our total liability is limited to the fees you paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.</p>

      <h2>8. Ending the agreement</h2>
      <p>You can close your account at any time. We may suspend or close accounts that break these terms. After closing, you can ask us to export your data within 30 days; after that we may delete it.</p>

      <h2>9. Contact</h2>
      <p>{COMPANY.name}, {COMPANY.address}. Email: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.</p>
    </LegalPage>
  );
}
