"use client";
import { useEffect, useState } from "react";

/** Footer of the workspace pages: copyright and the current date and time (in the visitor's own time zone). */
export function WorkspaceFooter() {
  const [now, setNow] = useState<Date | null>(null);  // set after mount, so the server and browser render the same HTML

  useEffect(() => {
    setNow(new Date());
    let timer = 0;
    // Tick on each new minute, so the clock never shows a stale minute.
    const tick = () => { setNow(new Date()); timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000)); };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <footer className="workspace-footer">
      <span>© {(now ?? new Date()).getFullYear()} SciProspect. All rights reserved.</span>
      {now && (
        <time dateTime={now.toISOString()}>
          {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </time>
      )}
    </footer>
  );
}
