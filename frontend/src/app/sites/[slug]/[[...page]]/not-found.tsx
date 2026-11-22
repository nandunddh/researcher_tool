/** Shown for an unpublished website, an unknown address or a page that does not exist. */
export default function SiteNotAvailable() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7fb", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#1d2433" }}>
      <section style={{ maxWidth: 460, textAlign: "center" }}>
        <div aria-hidden="true" style={{ width: 64, height: 64, margin: "0 auto 20px", borderRadius: 18, background: "#ece9ff", display: "grid", placeItems: "center", fontSize: 30 }}>🌐</div>
        <h1 style={{ margin: "0 0 10px", fontSize: 26 }}>This website isn’t available right now</h1>
        <p style={{ margin: 0, color: "#667085", lineHeight: 1.6 }}>
          It may not be published yet, or the address may be wrong. Please check the link or try again later.
        </p>
      </section>
    </main>
  );
}
