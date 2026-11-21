"use client";
import { useEffect, useState } from "react";
import styles from "./receipt.module.css";

type Line = { label: string; amount: number };
type ReceiptData = {
  number: string; paid_on: string; status: string; note: string;
  event: { name: string; starts: string; ends: string; venue: string; organiser: string; address: string; tax_id: string; email: string };
  buyer: { label: string; value: string | boolean }[];
  order: { currency?: string; lines?: Line[]; subtotal?: number; discount?: number; discount_code?: string; total?: number };
  tax: { label: string; rate: number; amount: number } | null;
};

const money = (currency: string, n = 0) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } };
const day = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");

/** Printable receipt for a paid registration. "Download PDF" uses the browser's Save as PDF. */
export function Receipt({ siteId, id, token }: { siteId: string; id: string; token: string }) {
  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/public/receipts/${encodeURIComponent(siteId)}/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`)
      .then(async res => { const body = await res.json().catch(() => null); if (!res.ok) throw new Error(body?.detail ?? "Receipt not found."); setData(body); })
      .catch(e => setError(e instanceof Error ? e.message : "Receipt not found."));
  }, [siteId, id, token]);

  if (error) return <main className={styles.page}><p className={styles.state}>{error}</p></main>;
  if (!data) return <main className={styles.page}><p className={styles.state}>Loading your receipt…</p></main>;
  const { event, order } = data, currency = order.currency || "USD";
  const dates = [day(event.starts), day(event.ends)].filter(Boolean).join(" – ");

  return (
    <main className={styles.page}>
      <div className={styles.actions}><button type="button" onClick={() => window.print()}>Download PDF / Print</button></div>
      <article className={styles.paper}>
        <header className={styles.top}>
          <div>
            <h1>{event.organiser || event.name}</h1>
            <p className={styles.muted}>{[event.address, event.email, event.tax_id && `Tax no. ${event.tax_id}`].filter(Boolean).join("\n")}</p>
          </div>
          <div className={styles.stamp}>
            <p className={styles.muted}>RECEIPT</p>
            <strong>{data.number}</strong>
            <p className={styles.muted}>Paid on {day(data.paid_on)}</p>
            <span className={styles.paid}>{data.status === "paid (test)" ? "Paid · test mode" : "Paid"}</span>
          </div>
        </header>

        <section className={styles.meta}>
          <div>
            <h2>Billed to</h2>
            {data.buyer.map((b, i) => <p key={i}>{typeof b.value === "boolean" ? b.label : String(b.value)}</p>)}
          </div>
          <div>
            <h2>Event</h2>
            <p><strong>{event.name}</strong></p>
            {dates && <p>{dates}</p>}
            {event.venue && <p>{event.venue}</p>}
          </div>
        </section>

        <table className={styles.lines}>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody>{(order.lines ?? []).map((l, i) => <tr key={i}><td>{l.label}</td><td>{money(currency, l.amount)}</td></tr>)}</tbody>
        </table>
        <div className={styles.totals}>
          <div><span>Subtotal</span><span>{money(currency, order.subtotal)}</span></div>
          {!!order.discount && <div><span>Discount {order.discount_code}</span><span>−{money(currency, order.discount)}</span></div>}
          <div className={styles.grand}><span>Total paid</span><span>{money(currency, order.total)}</span></div>
          {data.tax && <div><span className={styles.muted}>Includes {data.tax.label} ({data.tax.rate}%)</span><span className={styles.muted}>{money(currency, data.tax.amount)}</span></div>}
        </div>

        {data.note && <p className={`${styles.muted} ${styles.note}`}>{data.note}</p>}
      </article>
    </main>
  );
}
