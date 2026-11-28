"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LoadingIndicator } from "@/components/loading-indicator";
import { Icon } from "@/components/icon";
import { ClientShell } from "./shell";
import { TeamPanel, type Member } from "./team-panel";
import { share, usedOf } from "@/lib/plans";
import { EmptyState, LaunchCard, LaunchGrid, SectionTitle, Welcome } from "@/features/workspace/dashboard-parts";

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
  seat_limit: number;
  members: Member[];
  conferences: Conference[];
};

export function ClientDashboard() {
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [planName, setPlanName] = useState("");
  const [plan, setPlan] = useState<{ plan: { limits: Record<string, number | boolean> } | null; usage: Record<string, number> | null } | null>(null);
  useEffect(() => { api<NonNullable<typeof plan>>("/api/plan").then(setPlan).catch(() => undefined); }, []);

  // The plan the customer chose (Free, Pro, …), the same name Billing shows; the license tier is only the fallback.
  useEffect(() => {
    api<{ plan: { name: string } | null }>("/api/billing").then(b => setPlanName(b.plan?.name ?? "")).catch(() => undefined);
  }, []);

  async function load() {
    try { setData(await api<ClientData>("/api/client/overview")); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load client workspace"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

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
          <Welcome
            name={data.client_name}
            subtitle={data.client_email}
            chips={[
              { text: (planName || data.tier).toUpperCase(), tone: "lime" },
              { text: data.status === "active" ? `${data.days_left} left` : data.status, tone: data.status === "active" ? undefined : "red" },
              { text: data.scistudio_access ? "SciStudio on" : "SciStudio off" },
            ]}
            upgrade={data.tier === "trial" || data.status !== "active"}
            stats={[
              { label: "Contacts today",
                value: data.daily_limit < 0 ? "Unlimited" : `${(data.used_today || 0).toLocaleString()} / ${data.daily_limit.toLocaleString()}`,
                hint: data.daily_limit < 0 ? `${data.used_today || 0} collected today` : `${Math.max(0, data.daily_limit - (data.used_today || 0)).toLocaleString()} left today`,
                progress: data.daily_limit < 0 ? null : share(data.used_today, data.daily_limit) },
              ...(plan?.plan && plan.usage ? [{ label: "File storage", value: usedOf(plan.usage.storage_mb, Number(plan.plan.limits.storage_mb)),
                hint: `Data: ${usedOf(plan.usage.data_storage_mb, Number(plan.plan.limits.data_storage_mb))}`,
                progress: share(plan.usage.storage_mb, Number(plan.plan.limits.storage_mb)) }] : []),
              { label: "Plan validity", value: data.days_left,
                hint: data.expires_at && data.expires_at !== "never" ? `Until ${data.expires_at.slice(0, 10)}` : "No end date" },
              { label: "Conferences", value: data.conferences.length, hint: data.scistudio_access ? "Build websites in SciStudio" : "SciStudio is not in your plan" },
            ]}
          />

          <SectionTitle title="Your workspaces" note="Jump straight into your tools" />
          <LaunchGrid>
            <LaunchCard icon="search" tone="violet" eyebrow="Prospecting & discovery" title="Data Collector"
              text="Find researchers by topic, search NIH grants and export verified contacts." href="/client/collector" cta="Open Data Collector" />
            <LaunchCard icon="layers" tone="blue" eyebrow="Website builder" title="SciStudio"
              text="Design, preview and publish conference and event websites." href="/client/scistudio" cta="Open SciStudio" disabled={!data.scistudio_access} />
          </LaunchGrid>

          <TeamPanel members={data.members ?? []} seatLimit={data.seat_limit ?? 0} onChanged={load} />

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

            {data.conferences.length === 0 ? (
              <EmptyState icon="layers" title="No conferences yet" text="Create your first conference website in SciStudio. It will show up here." />
            ) : (
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
                </tbody>
              </table>
            </div>
            )}
          </section>
        </>
      ) : null}
    </ClientShell>
  );
}
