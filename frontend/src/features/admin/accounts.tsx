"use client";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingIndicator } from "@/components/loading-indicator";
import { api } from "@/lib/api";
import { Modal } from "@/components/modal";
import { PasswordInput } from "@/components/password-input";
import { updateAccount, matchesAccount } from "./requests";
import { AdminShell } from "./shell";

type Member = {
  member_id: string;
  name: string;
  email: string;
  role: string;
  scistudio_access: boolean;
};

type Account = {
  license_key: string;
  client_name: string;
  client_email: string;
  org_name: string;
  account_type: string;
  tier: string;
  status: string;
  days_left: string;
  daily_limit: number;
  seat_limit: number;
  scistudio_access: boolean;
  plan_id?: string;
  members: Member[];
  notes?: string;
};

/** Same rule as backend plans.default_plan_id, so the plan shows before usage has loaded. */
const defaultPlan = (a: { plan_id?: string; account_type: string; tier: string }) =>
  a.plan_id || (a.account_type === "org" ? "organization" : a.tier === "pro" ? "pro" : "free");

type Usage = { websites: number; pages: number; storage_mb: number; submissions_month: number };
type UsageEntry = { plan_id: string; usage: Usage; self_signup?: boolean;
  subscription?: { status: string; current_period_end: string | null; cancel_at_period_end: boolean; provider: string } | null };
export type Plan = { id: string; name: string; price_month: number; price_year?: number; kind?: "trial" | "paid" | "custom"; retired?: boolean; stripe_price_id?: string; stripe_price_id_year?: string; featured?: boolean; limits: Record<string, number | boolean> & { websites?: number; submissions_month?: number } };

export function ManageAccounts() {
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    label: string;
    run: () => Promise<void>;
  } | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const [mfaOn, setMfaOn] = useState<Set<string>>(new Set());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<Record<string, UsageEntry>>({});

  function loadPlans() {
    // Plans and usage are extra information; the page works without them.
    api<{ plans: Plan[] }>("/api/admin/plans").then(r => setPlans(r.plans)).catch(() => undefined);
    api<{ accounts: Record<string, UsageEntry> }>("/api/admin/usage").then(r => setUsage(r.accounts)).catch(() => undefined);
  }

  function usageText(key: string) {
    const entry = usage[key], limits = plans.find(p => p.id === entry?.plan_id)?.limits;
    if (!entry) return "";
    const of = (used: number, limit?: number) => `${used}${limit !== undefined && limit >= 0 ? `/${limit}` : ""}`;
    const sub = entry.subscription;
    const paid = sub?.status === "active"
      ? ` · ${sub.cancel_at_period_end ? "ends" : "paid, renews"} ${new Date(sub.current_period_end ?? "").toLocaleDateString()}${sub.provider === "test" ? " (test)" : ""}`
      : sub?.status === "canceled" ? " · subscription ended" : "";
    return `${entry.self_signup ? "Self sign-up · " : ""}${of(entry.usage.websites, limits?.websites)} sites · ${of(entry.usage.submissions_month, limits?.submissions_month)} submissions this month · ${entry.usage.storage_mb} MB${paid}`;
  }

  async function changePlan(account: Account, planId: string) {
    try {
      const result = await api<{ message: string }>("/api/admin/licenses/plan", { method: "POST", body: JSON.stringify({ license_key: account.license_key, plan_id: planId }) });
      toast.success(result.message);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The plan could not be changed.");
    }
  }

  async function reload() {
    setAccounts(await api<Account[]>("/api/admin/licenses"));
    // Two-step status is extra information; the page works without it.
    api<{ enabled: string[] }>("/api/admin/mfa").then(r => setMfaOn(new Set(r.enabled))).catch(() => undefined);
    loadPlans();
  }

  function resetTwoStep(account: Account, name: string, memberId = "") {
    setConfirmation({
      title: "Reset two-step sign-in?",
      description: `${name} will sign in with just their password and can set up two-step sign-in again. Only do this after you have confirmed who they are.`,
      label: "Reset two-step sign-in",
      run: async () => {
        try {
          await api("/api/admin/mfa/reset", { method: "POST", body: JSON.stringify({ license_key: account.license_key, member_id: memberId }) });
          setMfaOn(old => { const next = new Set(old); next.delete(`${account.license_key}:${memberId}`); return next; });
          toast.success(`Two-step sign-in turned off for ${name}.`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Two-step sign-in could not be reset.");
        } finally {
          setConfirmation(null);
        }
      },
    });
  }

  useEffect(() => {
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("created")) {
        toast.success("Account created successfully.");
        window.history.replaceState({}, "", "/root/accounts");
      }
    }
  }, []);

  async function action(
    account: Account,
    operation: string,
    extra: Record<string, unknown> = {},
    method = "POST"
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updateAccount(account.license_key, operation, extra, method);
      await reload();
      toast.success("Account updated successfully.");
      setConfirmation(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Operation failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const team = accounts.find((a) => a.license_key === selected);

  async function addMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !team) return;
    const form = e.currentTarget;
    const d = new FormData(form);
    await action(team, "org-members/add", {
      name: d.get("name"),
      email: d.get("email"),
      password: d.get("password"),
      role: d.get("role"),
      scistudio_access: d.has("studio"),
    });
  }

  const visible = accounts.filter((a) => matchesAccount(a, query, filter));

  return (
    <AdminShell title="Manage Accounts" path="/root/accounts">
      {error && <p className="alert" role="alert">{error}</p>}
      <section className="account-panel">
        <div className="toolbar">
          <input
            aria-label="Search accounts"
            placeholder="Search name, email or organization…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="actions">
            {[
              ["all", "All"],
              ["org", "Organizations"],
              ["single", "Individuals"],
              ["studio", "SciStudio"],
              ["pro", "Pro"],
              ["trial", "Trial"],
              ["stopped", "Stopped"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                className={filter === value ? "primary" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingIndicator label="Loading accounts…" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Client / organization",
                    "Team",
                    "License",
                    "Website plan",
                    "Status",
                    "SciStudio",
                    "Remaining",
                    "Daily limit",
                    "Actions",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => {
                  const root = a.license_key === "SCIP-PRO-ROOT-MASTER";
                  return (
                    <tr
                      key={a.license_key}
                      className={a.status === "stopped" ? "account-stopped" : undefined}
                    >
                      <td data-label="Account">
                        <span className="badge">
                          {root
                            ? "Root"
                            : a.account_type === "org"
                            ? "Organization"
                            : "Individual"}
                        </span>
                        <strong className="account-name">
                          {a.org_name || a.client_name}
                        </strong>
                        <small>{a.client_email}</small>
                      </td>
                      <td data-label="Team">
                        {a.account_type === "org" ? (
                          <button
                            type="button"
                            onClick={() => setSelected(a.license_key)}
                          >
                            {a.members.length}/{a.seat_limit} Team
                          </button>
                        ) : (
                          "Solo"
                        )}
                      </td>
                      <td data-label="License">{a.tier}</td>
                      <td data-label="Website plan">
                        {root ? "No limits" : (
                          <>
                            <select aria-label={`Website plan for ${a.client_name}`} disabled={busy || !plans.length}
                              value={usage[a.license_key]?.plan_id ?? defaultPlan(a)} onChange={e => void changePlan(a, e.target.value)}>
                              {plans.length ? plans.map(p => <option key={p.id} value={p.id}>{p.name}{p.retired ? " (retired)" : ""}</option>)
                                : <option value={usage[a.license_key]?.plan_id ?? defaultPlan(a)}>{(usage[a.license_key]?.plan_id ?? defaultPlan(a)).replace(/^./, c => c.toUpperCase())}</option>}
                            </select>
                            {usage[a.license_key] && <small style={{ display: "block", marginTop: 4 }}>{usageText(a.license_key)}</small>}
                          </>
                        )}
                      </td>
                      <td data-label="Status">
                        <span
                          className={
                            a.status === "stopped"
                              ? "badge status-stopped"
                              : "badge"
                          }
                        >
                          {a.status}
                        </span>
                      </td>
                      <td data-label="SciStudio">
                        <button
                          type="button"
                          disabled={busy || root}
                          onClick={() =>
                            action(a, "toggle-scistudio", {
                              enabled: !a.scistudio_access,
                            })
                          }
                        >
                          {a.scistudio_access ? "Enabled" : "Disabled"}
                        </button>
                      </td>
                      <td data-label="Remaining">{a.days_left}</td>
                      <td data-label="Daily limit">
                        {a.daily_limit < 0 ? "Unlimited" : a.daily_limit}
                      </td>
                      <td data-label="Actions">
                        {root ? (
                          "Protected account"
                        ) : (
                          <div className="actions">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (a.status === "stopped") void action(a, "resume");
                                else
                                  setConfirmation({
                                    title: "Suspend account?",
                                    description: `${a.client_name} will lose access until you resume their account.`,
                                    label: "Suspend account",
                                    run: () => action(a, "stop"),
                                  });
                              }}
                            >
                              {a.status === "stopped" ? "Resume" : "Suspend"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                action(a, "extend", { additional_days: 7 })
                              }
                            >
                              +7 days
                            </button>
                            {a.tier === "pro" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  action(a, "extend", { additional_days: 30 })
                                }
                              >
                                +30 days
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setSelected(a.license_key)}
                            >
                              Manage
                            </button>
                            {mfaOn.has(`${a.license_key}:`) && (
                              <button type="button" disabled={busy} title="For someone who lost their phone" onClick={() => resetTwoStep(a, a.client_name)}>
                                Reset two-step
                              </button>
                            )}
                            <button
                              type="button"
                              className="danger"
                              disabled={busy}
                              onClick={() => {
                                setConfirmation({
                                  title: "Delete account?",
                                  description: `Permanently delete ${a.client_name} and their account access? This cannot be undone.`,
                                  label: "Delete account",
                                  run: () =>
                                    action(
                                      a,
                                      encodeURIComponent(a.license_key),
                                      {},
                                      "DELETE"
                                    ),
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!visible.length && (
                  <tr>
                    <td colSpan={9}>No matching accounts.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {team && (
        <Modal
          title={team.org_name || team.client_name}
          onClose={() => setSelected(null)}
        >
          {error && <p className="alert" role="alert">{error}</p>}
          <p>{team.client_email}</p>
          {team.notes && <p>Internal note: {team.notes}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              const d = new FormData(e.currentTarget);
              void action(team, "upgrade", {
                new_tier: d.get("tier"),
                new_limit: Number(d.get("limit")),
              });
            }}
          >
            <div className="form-grid">
              <label>
                Plan
                <select name="tier" defaultValue={team.tier}>
                  <option value="trial">Trial</option>
                  <option value="pro">Pro</option>
                </select>
              </label>
              <label>
                Daily limit
                <input
                  name="limit"
                  type="number"
                  min="-1"
                  defaultValue={team.daily_limit}
                  required
                />
              </label>
            </div>
            <div className="modal-actions">
              <button disabled={busy}>Update plan</button>
            </div>
          </form>

          {team.account_type === "org" && (
            <>
              <h3>
                Team members ({team.members.length}/{team.seat_limit})
              </h3>
              {team.members.map((m) => (
                <div className="member-row" key={m.member_id}>
                  <div>
                    <strong>{m.name}</strong>
                    <small>
                      {m.email} • {m.role}
                    </small>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        action(team, "org-members/toggle-scistudio", {
                          member_id: m.member_id,
                          enabled: !m.scistudio_access,
                        })
                      }
                    >
                      Studio: {m.scistudio_access ? "On" : "Off"}
                    </button>
                    {mfaOn.has(`${team.license_key}:${m.member_id}`) && (
                      <button type="button" disabled={busy} onClick={() => resetTwoStep(team, m.name, m.member_id)}>Reset two-step</button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="danger"
                      onClick={() => {
                        setConfirmation({
                          title: "Remove team member?",
                          description: `${m.name} will lose access to this team.`,
                          label: "Remove member",
                          run: () =>
                            action(team, "org-members/remove", {
                              member_id: m.member_id,
                            }),
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <form onSubmit={addMember}>
                <h3>Add team member</h3>
                <div className="form-grid">
                  <label>
                    Name
                    <input name="name" required />
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Role
                    <select name="role" defaultValue="editor">
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>
                  <label>
                    Password (optional)
                    <PasswordInput name="password" autoComplete="new-password" />
                  </label>
                  <label className="inline-label">
                    <input type="checkbox" name="studio" defaultChecked />
                    SciStudio access
                  </label>
                </div>
                <div className="modal-actions">
                  <button
                    className="primary"
                    disabled={busy || team.members.length >= team.seat_limit}
                  >
                    Add member
                  </button>
                </div>
              </form>
            </>
          )}
        </Modal>
      )}

      {confirmation && (
        <ConfirmDialog
          {...confirmation}
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            if (busy) return;
            void confirmation.run();
          }}
        />
      )}
    </AdminShell>
  );
}
