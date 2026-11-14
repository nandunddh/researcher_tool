"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LoadingIndicator } from "@/components/loading-indicator";
import { Icon } from "@/components/icon";
import { ClientShell } from "./shell";

type Conference = {
  conference_id: string;
  name: string;
  description?: string;
  created_at?: string;
};

type ClientData = {
  license_key: string;
  client_name: string;
  client_email: string;
  tier: string;
  status: string;
  days_left: string;
  expires_at: string;
  daily_limit: number;
  used_today: number;
  scistudio_access: boolean;
  conferences: Conference[];
};

export function ClientDashboard() {
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ClientData>("/api/client/overview")
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load client workspace");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <ClientShell title="Client Dashboard" clientName={data?.client_name}>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <LoadingIndicator label="Loading your workspace…" />
      ) : data ? (
        <>
          {/* KPI Summary Cards */}
          <section className="stats-grid" aria-label="Client Account Summary">
            <article className="stat-card">
              <span className="stat-label">Researcher</span>
              <strong className="stat-value">{data.client_name}</strong>
              <small>{data.client_email}</small>
            </article>

            <article className="stat-card">
              <span className="stat-label">Plan &amp; Status</span>
              <strong className="stat-value">
                <span className="badge">{data.tier.toUpperCase()}</span>
              </strong>
              <small>
                Account:{" "}
                <span className={data.status === "stopped" ? "badge status-stopped" : "badge"}>
                  {data.status}
                </span>
              </small>
            </article>

            <article className="stat-card">
              <span className="stat-label">Daily Contact Quota</span>
              <strong className="stat-value">
                {data.daily_limit < 0 ? "Unlimited" : data.daily_limit.toLocaleString()}
              </strong>
              <small>{data.used_today || 0} extracted today</small>
            </article>

            <article className="stat-card">
              <span className="stat-label">Remaining Validity</span>
              <strong className="stat-value">{data.days_left}</strong>
              <small>SciStudio: {data.scistudio_access ? "Active" : "Disabled"}</small>
            </article>
          </section>

          {/* Quick Launch Cards */}
          <section className="account-panel" style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", margin: "0 0 1rem", fontWeight: 600 }}>
              Quick Launch Workspaces
            </h2>
            <div className="stats-grid">
              <article className="stat-card" style={{ padding: "1.5rem" }}>
                <span className="stat-label">PROSPECTING &amp; DISCOVERY</span>
                <strong className="stat-value" style={{ fontSize: "1.2rem", marginTop: "0.25rem" }}>
                  Data Collector
                </strong>
                <p style={{ color: "var(--text-secondary, #64748b)", fontSize: "0.88rem", margin: "0.5rem 0 1rem" }}>
                  Run live researcher discovery pipelines, search NIH grants, and export curated datasets.
                </p>
                <a className="button primary" href="/client/collector">
                  <Icon name="bolt" size={16} /> Open Data Collector
                </a>
              </article>

              <article className="stat-card" style={{ padding: "1.5rem" }}>
                <span className="stat-label">WEBSITE BUILDER</span>
                <strong className="stat-value" style={{ fontSize: "1.2rem", marginTop: "0.25rem" }}>
                  SciStudio
                </strong>
                <p style={{ color: "var(--text-secondary, #64748b)", fontSize: "0.88rem", margin: "0.5rem 0 1rem" }}>
                  Design, preview, and publish customized conference and event websites.
                </p>
                <a
                  className="button"
                  href="/client/scistudio"
                  style={{ opacity: data.scistudio_access ? 1 : 0.6 }}
                >
                  <Icon name="layers" size={16} /> Open SciStudio
                </a>
              </article>
            </div>
          </section>

          {/* Conferences Section */}
          <section className="account-panel" style={{ marginTop: "1.5rem" }}>
            <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600 }}>
                  Your Conferences ({data.conferences.length})
                </h2>
                <small style={{ color: "var(--text-secondary, #64748b)" }}>
                  Conferences linked to your individual researcher license.
                </small>
              </div>
              <a className="button primary" href="/client/scistudio">
                <Icon name="plus" size={16} /> Manage in SciStudio
              </a>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Conference Name</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conferences.map((c) => (
                    <tr key={c.conference_id}>
                      <td data-label="Conference Name">
                        <strong>{c.name}</strong>
                      </td>
                      <td data-label="Description">{c.description || "—"}</td>
                      <td data-label="Actions">
                        <a className="button" href="/client/scistudio">
                          Open in Studio
                        </a>
                      </td>
                    </tr>
                  ))}
                  {data.conferences.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>
                        No conferences created yet. Launch SciStudio to create your first conference.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </ClientShell>
  );
}
