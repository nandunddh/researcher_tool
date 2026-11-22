"""Subscriptions and payments.

Two providers share one flow:
  * "test" (default): our own checkout page; nothing is charged. It fires the same events Stripe would.
  * "stripe": set SCIPROSPECT_PAYMENTS=stripe, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in backend/.env,
    give each paid plan a Stripe price id (Plans page), and point a Stripe webhook at /api/billing/webhook.
Every change of state goes through handle_event(), so test mode behaves like live mode.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, Optional

import db

PERIOD = timedelta(days=30)


def provider() -> str:
    return "stripe" if os.environ.get("SCIPROSPECT_PAYMENTS") == "stripe" and os.environ.get("STRIPE_SECRET_KEY") else "test"


def _stripe():
    import stripe  # installed only when Stripe is switched on: pip install stripe
    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    return stripe


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- reading
def subscription(account_key: str) -> Optional[dict]:
    with db.transaction() as cur:
        cur.execute("SELECT plan_id, status, current_period_end, cancel_at_period_end, provider, provider_subscription_id "
                    "FROM subscriptions WHERE account_key = %s", (account_key,))
        row = cur.fetchone()
    if not row:
        return None
    return {"plan_id": row[0], "status": row[1], "current_period_end": row[2].isoformat() if row[2] else None,
            "cancel_at_period_end": row[3], "provider": row[4], "provider_subscription_id": row[5]}


def invoices(account_key: str) -> list:
    with db.transaction() as cur:
        cur.execute("SELECT id, number, plan_id, amount, currency, status, period_start, period_end, created_at "
                    "FROM invoices WHERE account_key = %s ORDER BY created_at DESC LIMIT 100", (account_key,))
        return [{"id": r[0], "number": r[1], "plan_id": r[2], "amount": float(r[3]), "currency": r[4], "status": r[5],
                 "period_start": r[6].isoformat(), "period_end": r[7].isoformat(), "created_at": r[8].isoformat()} for r in cur.fetchall()]


def invoice(account_key: str, invoice_id: int) -> Optional[dict]:
    return next((i for i in invoices(account_key) if i["id"] == invoice_id), None)


def checkout(session_id: str, account_key: str) -> Optional[dict]:
    with db.transaction() as cur:
        cur.execute("SELECT plan_id, amount, currency, status, provider FROM checkout_sessions WHERE id = %s AND account_key = %s",
                    (session_id, account_key))
        row = cur.fetchone()
    return {"id": session_id, "plan_id": row[0], "amount": float(row[1]), "currency": row[2], "status": row[3], "provider": row[4]} if row else None


# ---------------------------------------------------------------- starting a payment
def create_checkout(account_key: str, email: str, plan: dict, app_url: str) -> str:
    """Returns the URL to send the person to: our test checkout page, or Stripe Checkout."""
    if provider() == "stripe":
        if not plan.get("stripe_price_id"):
            raise ValueError("This plan has no Stripe price yet. Add it on the Plans page.")
        session = _stripe().checkout.Session.create(
            mode="subscription", line_items=[{"price": plan["stripe_price_id"], "quantity": 1}],
            success_url=f"{app_url}/billing?paid=1", cancel_url=f"{app_url}/billing?canceled=1",
            client_reference_id=account_key, customer_email=email,
            metadata={"account_key": account_key, "plan_id": plan["id"]},
            subscription_data={"metadata": {"account_key": account_key, "plan_id": plan["id"]}},
        )
        session_id, url = session["id"], session["url"]
    else:
        session_id = f"cs_test_{secrets.token_hex(12)}"
        url = f"/billing/checkout/{session_id}"
    with db.transaction() as cur:
        cur.execute("INSERT INTO checkout_sessions (id, account_key, plan_id, amount, provider) VALUES (%s, %s, %s, %s, %s)",
                    (session_id, account_key, plan["id"], plan["price_month"], provider()))
    return url


def pay_test_checkout(session_id: str, account_key: str, hooks: Dict[str, Callable]) -> bool:
    """Test provider only: the 'Pay' button. Fires the two events Stripe sends after a successful checkout."""
    found = checkout(session_id, account_key)
    if not found or found["status"] != "open" or found["provider"] != "test":
        return False
    sub_id = f"sub_test_{secrets.token_hex(8)}"
    handle_event({"type": "checkout.session.completed", "data": {"object": {
        "id": session_id, "client_reference_id": account_key, "subscription": sub_id, "customer": f"cus_test_{account_key[-6:]}",
        "metadata": {"account_key": account_key, "plan_id": found["plan_id"]}}}}, hooks)
    start = _now()
    handle_event({"type": "invoice.paid", "data": {"object": {
        "id": f"in_test_{secrets.token_hex(8)}", "subscription": sub_id, "amount_paid": round(found["amount"] * 100), "currency": found["currency"].lower(),
        "period_start": int(start.timestamp()), "period_end": int((start + PERIOD).timestamp())}}}, hooks)
    return True


# ---------------------------------------------------------------- the single place where state changes
def handle_event(event: dict, hooks: Dict[str, Callable]) -> None:
    """Applies a payment event (from Stripe's webhook or the test provider).
    hooks: on_paid(account_key, plan_id), on_renewed(account_key), on_ended(account_key)."""
    kind, obj = event.get("type"), (event.get("data") or {}).get("object") or {}
    if kind == "checkout.session.completed":
        meta = obj.get("metadata") or {}
        account_key, plan_id = meta.get("account_key") or obj.get("client_reference_id"), meta.get("plan_id")
        if not account_key or not plan_id:
            return
        with db.transaction() as cur:
            cur.execute("UPDATE checkout_sessions SET status = 'complete' WHERE id = %s", (obj.get("id"),))
            cur.execute("INSERT INTO subscriptions (account_key, plan_id, status, provider, provider_customer_id, provider_subscription_id) "
                        "VALUES (%s, %s, 'active', %s, %s, %s) ON CONFLICT (account_key) DO UPDATE SET plan_id = EXCLUDED.plan_id, "
                        "status = 'active', cancel_at_period_end = false, provider = EXCLUDED.provider, provider_customer_id = EXCLUDED.provider_customer_id, "
                        "provider_subscription_id = EXCLUDED.provider_subscription_id, updated_at = now()",
                        (account_key, plan_id, "stripe" if not str(obj.get("id", "")).startswith("cs_test_") else "test",
                         str(obj.get("customer") or ""), str(obj.get("subscription") or "")))
        hooks["on_paid"](account_key, plan_id)
    elif kind == "invoice.paid":
        with db.transaction() as cur:
            cur.execute("SELECT account_key, plan_id, provider FROM subscriptions WHERE provider_subscription_id = %s", (str(obj.get("subscription") or ""),))
            row = cur.fetchone()
            if not row:
                return
            account_key, plan_id, prov = row
            start = datetime.fromtimestamp(int(obj.get("period_start") or _now().timestamp()), timezone.utc)
            end = datetime.fromtimestamp(int(obj.get("period_end") or (start + PERIOD).timestamp()), timezone.utc)
            cur.execute("SELECT 1 FROM invoices WHERE provider_invoice_id = %s", (str(obj.get("id") or ""),))
            if cur.fetchone():
                return  # Stripe may send the same event twice
            cur.execute("SELECT nextval('invoice_numbers')")
            number = f"INV-{cur.fetchone()[0]:06d}"
            amount, currency = (obj.get("amount_paid") or 0) / 100, str(obj.get("currency") or "usd").upper()
            cur.execute("INSERT INTO invoices (number, account_key, plan_id, amount, currency, period_start, period_end, provider, provider_invoice_id) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                        (number, account_key, plan_id, amount, currency, start, end, prov, str(obj.get("id") or "")))
            invoice_id = cur.fetchone()[0]
            cur.execute("UPDATE subscriptions SET status = 'active', current_period_end = %s, updated_at = now() WHERE account_key = %s", (end, account_key))
        hooks["on_renewed"](account_key)
        if "on_invoice" in hooks:
            hooks["on_invoice"](account_key, {"id": invoice_id, "number": number, "plan_id": plan_id, "amount": amount, "currency": currency,
                                              "period_start": start, "period_end": end})
    elif kind == "customer.subscription.updated":
        with db.transaction() as cur:
            cur.execute("UPDATE subscriptions SET cancel_at_period_end = %s, updated_at = now() WHERE provider_subscription_id = %s",
                        (bool(obj.get("cancel_at_period_end")), str(obj.get("id") or "")))
    elif kind == "customer.subscription.deleted":
        with db.transaction() as cur:
            cur.execute("UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE provider_subscription_id = %s RETURNING account_key",
                        (str(obj.get("id") or ""),))
            row = cur.fetchone()
        if row:
            hooks["on_ended"](row[0])


# ---------------------------------------------------------------- changes the customer makes
def set_cancel(account_key: str, cancel: bool, hooks: Dict[str, Callable]) -> bool:
    """Cancel at the end of the paid period (or undo that)."""
    sub = subscription(account_key)
    if not sub or sub["status"] != "active":
        return False
    if sub["provider"] == "stripe":
        _stripe().Subscription.modify(sub["provider_subscription_id"], cancel_at_period_end=cancel)
    handle_event({"type": "customer.subscription.updated", "data": {"object": {"id": sub["provider_subscription_id"], "cancel_at_period_end": cancel}}}, hooks)
    return True


def sync_test(account_key: str, hooks: Dict[str, Callable]) -> None:
    """Test provider: does what Stripe does on its own when a period ends (renew, or end a canceled subscription)."""
    for _ in range(24):  # catch up at most two years
        sub = subscription(account_key)
        if not sub or sub["provider"] != "test" or sub["status"] != "active" or not sub["current_period_end"]:
            return
        end = datetime.fromisoformat(sub["current_period_end"])
        if end > _now():
            return
        if sub["cancel_at_period_end"]:
            handle_event({"type": "customer.subscription.deleted", "data": {"object": {"id": sub["provider_subscription_id"]}}}, hooks)
            return
        with db.transaction() as cur:
            cur.execute("SELECT amount FROM invoices WHERE account_key = %s ORDER BY created_at DESC LIMIT 1", (account_key,))
            amount = float((cur.fetchone() or [0])[0])
        handle_event({"type": "invoice.paid", "data": {"object": {
            "id": f"in_test_{secrets.token_hex(8)}", "subscription": sub["provider_subscription_id"], "amount_paid": round(amount * 100),
            "period_start": int(end.timestamp()), "period_end": int((end + PERIOD).timestamp())}}}, hooks)


def verify_webhook(payload: bytes, signature: str) -> dict:
    """Stripe only: checks the webhook signature and returns the event. Raises on a bad signature."""
    return _stripe().Webhook.construct_event(payload, signature, os.environ["STRIPE_WEBHOOK_SECRET"])


def check_test_card(body: dict) -> Optional[str]:
    """Test provider: card checks like Stripe's test mode. Returns a message for the payer, or None."""
    import re
    number = re.sub(r"\D", "", str(body.get("card_number") or ""))
    if not 12 <= len(number) <= 19 or not re.fullmatch(r"(0[1-9]|1[0-2])\s*/\s*\d{2}", str(body.get("expiry") or "").strip()) \
            or not re.fullmatch(r"\d{3,4}", str(body.get("cvc") or "").strip()):
        return "Check the card number, expiry (MM/YY) and security code."
    if number == "4000000000000002":
        return "Your card was declined. (Test card: use 4242 4242 4242 4242 to succeed.)"
    return None


def switch_plan(account_key: str, sub: dict, plan: dict) -> None:
    """Move an active subscription to another paid plan (Stripe prorates the difference)."""
    if sub["provider"] == "stripe":
        stripe_api = _stripe()
        item = stripe_api.Subscription.retrieve(sub["provider_subscription_id"])["items"]["data"][0]["id"]
        stripe_api.Subscription.modify(sub["provider_subscription_id"], items=[{"id": item, "price": plan["stripe_price_id"]}],
                                       proration_behavior="create_prorations")
    with db.transaction() as cur:
        cur.execute("UPDATE subscriptions SET plan_id = %s, cancel_at_period_end = false, updated_at = now() WHERE account_key = %s",
                    (plan["id"], account_key))
