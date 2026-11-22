"use client";
import { useEffect, useState } from "react";
import { Collector } from "@/features/collector/collector";
import { LoadingIndicator } from "@/components/loading-indicator";
import { api } from "@/lib/api";
import type { Account } from "@/lib/contracts";
import { Modal } from "@/components/modal";
import { AdminShell } from "./shell";

export function RootDashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ accounts: Account[] }>("/api/admin/overview", { signal: controller.signal })
      .then((result) => setAccounts(result.accounts))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load accounts.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const clients = accounts.filter((account) => !account.is_root);
  const metrics = [
    ["Client accounts", clients.length],
    ["Organizations", clients.filter((a) => a.account_type === "org").length],
    ["Team members", clients.reduce((sum, a) => sum + a.members.length, 0)],
    ["Active client accounts", clients.filter((a) => a.status === "active").length],
  ];
  const visible = accounts.filter(
    (account) =>
      (!status || account.status === status) &&
      `${account.client_name} ${account.client_email} ${account.org_name || ""}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );

  return (
    <AdminShell title="Root Dashboard" path="/root/dashboard">
      {error && <p role="alert" className="alert">{error}</p>}
          {loading ? (
            <LoadingIndicator label="Loading accounts"/>
          ) : (
            <>
              <div className="metrics">
                {metrics.map(([label, count]) => (
                  <article key={label} className="metric">
                    <strong>{count}</strong>
                    <span>{label}</span>
                  </article>
                ))}
              </div>
              <section className="account-panel">
                <div className="toolbar">
                  <h2>Accounts &amp; organizations</h2>
                  <input
                    aria-label="Search accounts"
                    placeholder="Search name, email, organization…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    aria-label="Account status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {["active", "expired", "stopped"].map((val) => (
                      <option key={val}>{val}</option>
                    ))}
                  </select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Organization / Account",
                          "Owner",
                          "Plan",
                          "Status",
                          "Team",
                          "SciStudio",
                          "",
                        ].map((label, index) => (
                          <th key={index}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((account, index) => (
                        <tr key={`${account.client_email}-${index}`} className={account.status === "stopped" ? "account-stopped" : undefined}>
                          <td data-label="Account">
                            <strong>{account.org_name || account.client_name}</strong>
                            <small>
                              {account.is_root ? "Root administrator" : account.account_type === "org"
                                ? "Organization"
                                : "Client account"}
                            </small>
                          </td>
                          <td data-label="Owner">
                            {account.client_name}
                            <small>{account.client_email}</small>
                          </td>
                          <td data-label="Plan">{account.tier}</td>
                          <td data-label="Status">
                            <span className={account.status === "stopped" ? "badge status-stopped" : "badge"}>{account.status}</span>
                          </td>
                          <td data-label="Team">{account.members.length} members</td>
                          <td data-label="SciStudio">
                            {account.scistudio_access ? "Enabled" : "Disabled"}
                          </td>
                          <td>
                            <button onClick={() => setSelected(account)}>
                              View details
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!visible.length && (
                        <tr>
                          <td colSpan={7}>No matching accounts.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {selected && (
        <Modal
          title={selected.org_name || selected.client_name}
          onClose={() => setSelected(null)}
        >
          <dl className="review">
            {Object.entries({
              Owner: selected.client_name,
              Email: selected.client_email,
              Plan: selected.tier,
              Status: selected.status,
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h3>Team members</h3>
          {selected.members.length ? (
            selected.members.map((member) => (
              <p key={member.email}>
                {member.name} — {member.email} ({member.role})
              </p>
            ))
          ) : (
            <p>No team members yet.</p>
          )}
          <a className="button" href="/root/accounts">
            Manage account
          </a>
        </Modal>
      )}
      <Collector />
    </AdminShell>
  );
}
