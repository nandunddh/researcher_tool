"use client";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingIndicator } from "@/components/loading-indicator";
import { Modal } from "@/components/modal";
import { PasswordInput } from "@/components/password-input";
import { Icon } from "@/components/icon";
import { OrgShell } from "./shell";
import { share } from "@/lib/plans";
import { LaunchCard, LaunchGrid, SectionTitle, TopActions, Welcome } from "@/features/workspace/dashboard-parts";

type Member = {
  member_id: string;
  name: string;
  email: string;
  role: string;
  scistudio_access: boolean;
  created_at?: string;
};

type Conference = {
  conference_id: string;
  name: string;
  description?: string;
  created_at?: string;
};

type OrgData = {
  license_key: string;
  org_name: string;
  client_name: string;
  client_email: string;
  tier: string;
  status: string;
  days_left: string;
  expires_at: string;
  seat_limit: number;
  daily_limit: number;
  used_today: number;
  scistudio_access: boolean;
  members: Member[];
  conferences: Conference[];
};

export function OrgDashboard() {
  const [data, setData] = useState<OrgData | null>(null);
  const [plan, setPlan] = useState<{ plan: { name: string; limits: Record<string, number | boolean> } | null; usage: { websites: number } | null } | null>(null);
  useEffect(() => { api<NonNullable<typeof plan>>("/api/plan").then(setPlan).catch(() => undefined); }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Modals & Confirmation
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddConf, setShowAddConf] = useState(false);
  const [confName, setConfName] = useState("");
  const [confDesc, setConfDesc] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    label: string;
    run: () => Promise<void>;
  } | null>(null);

  async function loadData() {
    try {
      const res = await api<OrgData>("/api/organization/overview");
      setData(res);
      setError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load organization data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleAddMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !data) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api("/api/organization/team/add", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          role: fd.get("role"),
          password: fd.get("password") || undefined,
          scistudio_access: fd.has("studio"),
        }),
      });
      toast.success("Team member added successfully.");
      setShowAddMember(false);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add member";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (busy || !data) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/organization/team/remove", {
        method: "POST",
        body: JSON.stringify({ member_id: memberId }),
      });
      toast.success("Team member removed.");
      setConfirmation(null);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStudio(memberId: string, currentVal: boolean) {
    if (busy || !data) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/organization/team/toggle-scistudio", {
        method: "POST",
        body: JSON.stringify({ member_id: memberId, enabled: !currentVal }),
      });
      toast.success("SciStudio access updated.");
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update member SciStudio access";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddConference(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !confName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/builder/conferences", {
        method: "POST",
        body: JSON.stringify({ name: confName.trim(), description: confDesc.trim() }),
      });
      toast.success("Conference created successfully.");
      setConfName("");
      setConfDesc("");
      setShowAddConf(false);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create conference";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteConference(confId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/builder/conferences/${encodeURIComponent(confId)}`, {
        method: "DELETE",
      });
      toast.success("Conference removed.");
      setConfirmation(null);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete conference";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrgShell title="Organization Dashboard" orgName={data?.org_name}
      actions={data ? <TopActions upgrade={data.tier === "trial" || data.status !== "active"} /> : undefined}>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <LoadingIndicator label="Loading organization workspace…" />
      ) : data ? (
        <>
          <Welcome
            name={data.client_name}
            subtitle={`${data.org_name} · ${data.client_email}`}
            chips={[
              { text: (plan?.plan?.name || data.tier).toUpperCase(), tone: "lime" },
              { text: data.status === "active" ? `${data.days_left} left` : data.status, tone: data.status === "active" ? undefined : "red" },
              { text: data.scistudio_access ? "SciStudio on" : "SciStudio off" },
            ]}
            stats={[
              { label: "Team seats", value: `${data.members.length} / ${data.seat_limit}`,
                hint: data.seat_limit - data.members.length > 0 ? `${data.seat_limit - data.members.length} seats free` : "All seats in use",
                progress: share(data.members.length, data.seat_limit) },
              { label: "Contacts today",
                value: data.daily_limit < 0 ? "Unlimited" : `${(data.used_today || 0).toLocaleString()} / ${data.daily_limit.toLocaleString()}`,
                hint: data.daily_limit < 0 ? `${data.used_today || 0} collected today` : `${Math.max(0, data.daily_limit - (data.used_today || 0)).toLocaleString()} left today`,
                progress: data.daily_limit < 0 ? null : share(data.used_today, data.daily_limit) },
              ...(plan?.plan && plan.usage ? [{ label: "Websites",
                value: Number(plan.plan.limits.websites) < 0 ? `${plan.usage.websites}` : `${plan.usage.websites} / ${plan.plan.limits.websites}`,
                hint: Number(plan.plan.limits.websites) < 0 ? "Unlimited websites" : "Websites in your plan",
                progress: share(plan.usage.websites, Number(plan.plan.limits.websites)) }] : []),
              { label: "Plan validity", value: data.days_left,
                hint: data.expires_at && data.expires_at !== "never" ? `Until ${data.expires_at.slice(0, 10)}` : "No end date" },
            ]}
          />

          <SectionTitle title="Your workspaces" note="Jump straight into your tools" />
          <LaunchGrid>
            <LaunchCard icon="search" tone="violet" eyebrow="Prospecting & discovery" title="Data Collector"
              text="Find researchers by topic, search NIH grants and export verified contacts." href="/organization/collector" cta="Open Data Collector" />
            <LaunchCard icon="layers" tone="blue" eyebrow="Website builder" title="SciStudio"
              text="Design, preview and publish conference and event websites." href="/organization/scistudio" cta="Open SciStudio" disabled={!data.scistudio_access} />
          </LaunchGrid>

          {/* Team Members Management Section */}
          <section className="account-panel" style={{ marginTop: "1.5rem" }}>
            <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600 }}>
                  Team Members ({data.members.length}/{data.seat_limit})
                </h2>
                <small style={{ color: "var(--text-secondary, #64748b)" }}>
                  Members can access the data collector and build conference websites.
                </small>
              </div>
              <button
                type="button"
                className="primary"
                disabled={busy || data.members.length >= data.seat_limit}
                onClick={() => setShowAddMember(true)}
              >
                <Icon name="plus" size={16} /> Add Team Member
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>SciStudio Access</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.member_id}>
                      <td data-label="Member">
                        <strong>{m.name}</strong>
                      </td>
                      <td data-label="Email">{m.email}</td>
                      <td data-label="Role">
                        <span className="badge">{m.role.toUpperCase()}</span>
                      </td>
                      <td data-label="SciStudio Access">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleStudio(m.member_id, m.scistudio_access)}
                        >
                          {m.scistudio_access ? "Enabled" : "Disabled"}
                        </button>
                      </td>
                      <td data-label="Joined">{m.created_at?.slice(0, 10) || "Recent"}</td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            setConfirmation({
                              title: "Remove team member?",
                              description: `Permanently remove ${m.name} (${m.email}) from ${data.org_name}? They will lose access to team workspaces.`,
                              label: "Remove member",
                              run: () => handleRemoveMember(m.member_id),
                            })
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.members.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>
                        No team members added yet. Click &quot;Add Team Member&quot; to invite colleagues.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Conference Management Section */}
          <section className="account-panel" style={{ marginTop: "1.5rem" }}>
            <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600 }}>
                  Conferences &amp; Events ({data.conferences.length})
                </h2>
                <small style={{ color: "var(--text-secondary, #64748b)" }}>
                  Create conference workspaces to group event websites and research leads.
                </small>
              </div>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => setShowAddConf(true)}
              >
                <Icon name="plus" size={16} /> New Conference
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Conference Name</th>
                    <th>Description</th>
                    <th>Workspace</th>
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
                      <td data-label="Workspace">
                        <a
                          className="button"
                          href={`/organization/scistudio`}
                          title="Open website builder"
                        >
                          SciStudio
                        </a>
                      </td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            setConfirmation({
                              title: "Delete conference?",
                              description: `Delete ${c.name}? Any associated websites will be unlinked.`,
                              label: "Delete conference",
                              run: () => handleDeleteConference(c.conference_id),
                            })
                          }
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.conferences.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>
                        No conferences created yet. Click &quot;New Conference&quot; to start.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {/* Add Member Modal */}
      {showAddMember && data && (
        <Modal title="Add Team Member" onClose={() => setShowAddMember(false)}>
          <form onSubmit={handleAddMember}>
            <div className="form-grid">
              <label>
                Member name
                <input name="name" required placeholder="e.g. Dr. Jane Smith" />
              </label>
              <label>
                Email
                <input name="email" type="email" required placeholder="jane@organization.org" />
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
                <PasswordInput name="password" autoComplete="new-password" placeholder="Leave blank to set later" />
              </label>
              <label className="inline-label">
                <input type="checkbox" name="studio" defaultChecked />
                Enable SciStudio access
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={() => setShowAddMember(false)}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Adding…" : "Add Member"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Conference Modal */}
      {showAddConf && (
        <Modal title="New Conference" onClose={() => setShowAddConf(false)}>
          <form onSubmit={handleAddConference}>
            <div className="form-grid">
              <label>
                Conference Name
                <input
                  required
                  value={confName}
                  onChange={(e) => setConfName(e.target.value)}
                  placeholder="e.g. Annual Immunology Congress 2026"
                />
              </label>
              <label>
                Description (optional)
                <input
                  value={confDesc}
                  onChange={(e) => setConfDesc(e.target.value)}
                  placeholder="e.g. Global symposium on immunology and oncology"
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={() => setShowAddConf(false)}>
                Cancel
              </button>
              <button className="primary" disabled={busy || !confName.trim()}>
                {busy ? "Creating…" : "Create Conference"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Centered Confirmation Dialog */}
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
    </OrgShell>
  );
}
