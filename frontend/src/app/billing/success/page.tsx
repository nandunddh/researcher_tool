import { PaymentSuccess } from "@/features/billing/billing";

export const metadata = { title: "Payment received · SciProspect", robots: { index: false } };

/** Where checkout (test or Stripe) returns after paying; shows the message on a clean /billing. */
export default function Page() {
  return <PaymentSuccess />;
}
