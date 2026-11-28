import type { Metadata } from "next";
import { COMPANY, ContactDetails, ContactLink, LegalPage, publicContact } from "@/features/marketing/legal";

export const metadata: Metadata = { title: "Privacy policy · SciProspect", description: "How SciProspect collects, uses and protects personal data.", alternates: { canonical: "/privacy" } };

// Draft policy written for how SciProspect works. Have it reviewed by a lawyer before launch.
export default async function Page() {
  const contact = await publicContact();
  return (
    <LegalPage title="Privacy policy" intro={`This policy explains what personal data ${COMPANY.name} handles, why, and the choices you have.`}>
      <h2>1. Data about our customers</h2>
      <ul>
        <li><strong>Account details:</strong> name, email, organization, password (stored only as a secure hash) and two-step sign-in settings.</li>
        <li><strong>Billing:</strong> your plan, invoices and payment status. Card details are handled by our payment provider, not stored by us.</li>
        <li><strong>Usage and security:</strong> sign-in times and the IP addresses used, to keep accounts safe and prevent abuse.</li>
      </ul>
      <p>We use this to provide the service, bill you, keep it secure, send service emails (such as codes, invoices and receipts) and answer support requests.</p>

      <h2>2. Data on websites our customers build</h2>
      <p>When a SciStudio website collects registrations, payments, messages or abstracts, the website&apos;s owner decides what is collected and why. They are the controller; we store and process that data on their behalf. Visitors should contact the website&apos;s organiser about their data. Attendees receive receipts and confirmations by email.</p>

      <h2>3. Researcher data (SciProspect)</h2>
      <p>The data collector processes professional information about researchers (such as name, affiliation, field and a professional email address) from public scholarly sources, so that organisers can find relevant speakers and participants. The basis is legitimate interest in professional, research-related contact. Researchers can ask us to remove their data or stop it being collected by writing to <ContactLink contact={contact} />.</p>

      <h2>4. Service providers</h2>
      <p>We use trusted providers to run the service, under contracts that protect your data:</p>
      <ul>
        <li>Cloud hosting and database (Oracle Cloud)</li>
        <li>Email delivery (Brevo)</li>
        <li>Payment processing (Stripe, when online payments are on)</li>
      </ul>
      <p>We do not sell personal data.</p>

      <h2>5. Cookies</h2>
      <p>We use one essential cookie to keep you signed in. We do not use advertising cookies. Websites built with SciStudio may add analytics (such as Google Analytics) if their owner chooses to.</p>

      <h2>6. How long we keep data</h2>
      <ul>
        <li>Account data: while your account is open, and up to 30 days after you close it.</li>
        <li>Invoices: as long as tax law requires.</li>
        <li>Security logs: for a limited time, normally no longer than 12 months.</li>
      </ul>

      <h2>7. Security</h2>
      <p>Passwords are hashed, two-step sign-in is required for every account, connections are encrypted, uploaded files are private, and prices and payments are checked on our servers.</p>

      <h2>8. Your rights</h2>
      <p>Depending on where you live, you can ask to access, correct, export or delete your personal data, or object to some uses. Write to <ContactLink contact={contact} />. You can also complain to your local data protection authority.</p>

      <h2>9. Contact</h2>
      <ContactDetails contact={contact} />
    </LegalPage>
  );
}
