"use client";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { LoadingIndicator } from "@/components/loading-indicator";
import { AdminShell } from "./shell";

type DemoRequest = { id: number; name: string; email: string; organization: string; interest: string; message: string; times: string; status: "new" | "contacted" | "done"; created_at: string };

const INTEREST: Record<string, string> = { collect: "Collecting contacts", studio: "Event websites", both: "Both", custom: "Custom plan" };
const STATUS: [DemoRequest["status"], string][] = [["new", "New"], ["contacted", "Contacted"], ["done", "Done"]];

/** Root: "Book a demo" requests from the public website, newest first. Reply by email, then mark the request. */
export function DemoRequests() {
  const [requests, setRequests] = useState<DemoRequest[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  useEffect(() => {
    api<{ requests: DemoRequest[] }>("/api/admin/demo-requests").then(r => setRequests(r.requests)).catch(e => setError(e instanceof Error ? e.message : "Requests could not be loaded."));
  }, []);

  async function setStatus(item: DemoRequest, status: DemoRequest["status"]) {
    const before = item.status;
    setRequests(all => all?.map(r => (r.id === item.id ? { ...r, status } : r)) ?? null);
    try { await api(`/api/admin/demo-requests/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); }
    catch (e) {
      setRequests(all => all?.map(r => (r.id === item.id ? { ...r, status: before } : r)) ?? null);
      toast.error(e instanceof Error ? e.message : "The status could not be saved.");
    }
  }

  const shown = (requests ?? []).filter(r => filter === "all" || r.status !== "done");
  const open = (requests ?? []).filter(r => r.status === "new").length;
  return (
    <AdminShell title="Demo requests" path="/root/demo-requests">
      {error && <p className="alert" role="alert">{error}</p>}
      {!requests && !error ? <LoadingIndicator label="Loading demo requests…" /> : requests && (
        <section className="account-panel">
          <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600 }}>{open} new {open === 1 ? "request" : "requests"}</h2>
              <small style={{ color: "var(--text-secondary, #64748b)" }}>From the Book a demo page. Set SCIPROSPECT_DEMO_EMAIL on the server to also get each one by email.</small>
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>Show
              <select value={filter} onChange={e => setFilter(e.target.value as "open" | "all")}><option value="open">Not done</option><option value="all">All</option></select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Received</th><th>Person</th><th>Interested in</th><th>Preferred times</th><th>Message</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id}>
                    <td data-label="Received">{new Date(r.created_at).toLocaleString()}</td>
                    <td data-label="Person"><strong>{r.name}</strong><br /><a href={`mailto:${r.email}?subject=${encodeURIComponent("Your SciProspect demo")}`}>{r.email}</a>{r.organization && <><br /><small>{r.organization}</small></>}</td>
                    <td data-label="Interested in">{INTEREST[r.interest] ?? r.interest}</td>
                    <td data-label="Preferred times">{r.times || "—"}</td>
                    <td data-label="Message" style={{ whiteSpace: "pre-line", maxWidth: 360 }}>{r.message || "—"}</td>
                    <td data-label="Status">
                      <select value={r.status} onChange={e => void setStatus(r, e.target.value as DemoRequest["status"])} aria-label={`Status of ${r.name}'s request`}>
                        {STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>{requests.length ? "Every request is done." : "No demo requests yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AdminShell>
  );
}
