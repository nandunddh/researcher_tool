"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="error-page"><h1>We couldn’t load this workspace.</h1><p>Check that the SciProspect server is running, then try again.</p><button onClick={reset}>Try again</button></main>;
}
