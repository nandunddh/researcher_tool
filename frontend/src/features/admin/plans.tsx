"use client";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { LoadingIndicator } from "@/components/loading-indicator";
import { AdminShell } from "./shell";
import type { Plan } from "./accounts";

const LIMITS: [string, string, string][] = [
  ["websites", "Websites", ""], ["pages", "Pages per website", ""], ["members", "Team members", "Becomes the account's seat limit."],
  ["storage_mb", "Image storage (MB)", ""], ["submissions_month", "Form submissions per month", "Registrations, messages and abstracts together."],
];

/** Root: edit website plans. Changes apply at once to every account on the plan. -1 = unlimited. */
export function PlansAdmin() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ plans: Plan[] }>("/api/admin/plans").then(r => setPlans(r.plans)).catch(e => setError(e instanceof Error ? e.message : "Plans could not be loaded."));
  }, []);

  const update = (id: string, patch: Partial<Plan>) => setPlans(all => all?.map(p => p.id === id ? { ...p, ...patch } : p) ?? null);
  const setLimit = (p: Plan, key: string, value: number | boolean) => update(p.id, { limits: { ...p.limits, [key]: value } });

  async function save(plan: Plan) {
    setSaving(plan.id);
    try {
      const result = await api<{ plan: Plan }>(`/api/admin/plans/${encodeURIComponent(plan.id)}`, { method: "PUT", body: JSON.stringify(plan) });
      update(plan.id, result.plan);
      toast.success(`${result.plan.name} saved.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The plan could not be saved.");
    } finally {
      setSaving("");
    }
  }

  return (
    <AdminShell title="Plans" path="/root/plans">
      <p style={{ margin: "0 0 16px", color: "var(--muted, #667085)" }}>
        Website plans limit what each account can do in SciStudio. Use <strong>-1</strong> for unlimited. Changes apply to every account on that plan at once.
        Choose an account&apos;s plan in Manage Accounts.
      </p>
      {error && <p className="alert" role="alert">{error}</p>}
      {!plans && !error && <LoadingIndicator label="Loading plans…" />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        {plans?.map(p => (
          <section key={p.id} className="account-panel" style={{ padding: 22, display: "grid", gap: 12, alignContent: "start" }}>
            <label>Name<input value={p.name} maxLength={40} onChange={e => update(p.id, { name: e.target.value })} /></label>
            <label>Price per month<input inputMode="decimal" value={p.price_month} onChange={e => update(p.id, { price_month: Number(e.target.value) || 0 })} /></label>
            {LIMITS.map(([key, label, hint]) => (
              <label key={key}>{label}
                <input inputMode="numeric" value={String(p.limits[key] ?? -1)} onChange={e => { const n = Number(e.target.value); if (e.target.value === "-" || Number.isFinite(n)) setLimit(p, key, Number.isFinite(n) ? Math.round(n) : -1); }} />
                {hint && <small style={{ fontWeight: 400, color: "var(--muted, #667085)" }}>{hint}</small>}
              </label>
            ))}
            {p.price_month > 0 && (
              <label>Stripe price id <small style={{ fontWeight: 400, color: "var(--muted, #667085)" }}>Needed only when Stripe is switched on (starts with price_).</small>
                <input value={p.stripe_price_id ?? ""} placeholder="price_…" onChange={e => update(p.id, { stripe_price_id: e.target.value.trim() })} />
              </label>
            )}
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={p.limits.custom_domain === true} onChange={e => setLimit(p, "custom_domain", e.target.checked)} />Custom domain
            </label>
            <button type="button" className="primary" disabled={saving === p.id} onClick={() => void save(p)}>{saving === p.id ? "Saving…" : `Save ${p.name}`}</button>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
