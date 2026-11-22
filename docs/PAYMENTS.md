# Payments: test mode now, Stripe later

Subscriptions (plans) and registration payments run in **test mode** by default. No money moves, but every step works like it will with Stripe.

## How it works today (test mode)

1. Someone chooses a paid plan (pricing page → sign up, or Billing → Upgrade).
2. The backend creates a **checkout session** (`cs_test_…`) and sends them to `/billing/checkout/…`, a page laid out like Stripe Checkout.
3. Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined. Any future date, any 3-digit code.
4. Paying fires the same events Stripe sends: `checkout.session.completed` and then `invoice.paid`. One handler (`backend/billing.py → handle_event`) applies them:
   - the account moves to the plan (limits and team seats),
   - the collector license becomes Pro for the paid period,
   - an invoice is created (`INV-000001`), viewable and printable on the Billing page.
5. When a period ends, test mode does what Stripe does on its own: it renews (a new invoice), or ends a canceled subscription and moves the account back to Free.

## Switching on Stripe (later)

1. Create a Stripe account. Use **test keys** first, then live keys.
2. In Stripe, create one **recurring monthly price** for each paid plan, then copy each price id (`price_…`) into **Root → Plans** (the "Stripe price id" box).
3. Install the library: `.venv\Scripts\python.exe -m pip install stripe`
4. Add these to `backend/.env`. Never put them in chat or git.
   ```
   SCIPROSPECT_PAYMENTS=stripe
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   SCIPROSPECT_APP_URL=https://your-domain
   ```
5. In Stripe → Developers → Webhooks, add the endpoint `https://your-domain/api/billing/webhook` with these events:
   `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`.
6. Restart the backend. Upgrade buttons now open Stripe Checkout, and Stripe's webhooks drive the same handler. Nothing else changes.

To go back to test mode, remove `SCIPROSPECT_PAYMENTS=stripe` (or the secret key).

## Not yet connected to Stripe

- **Registration payments on event websites** still use their own test step (`/pay-test`). Moving those to Stripe Checkout is a separate small step.
- **Plan changes** between paid plans are applied right away. With Stripe, Stripe prorates the difference.
