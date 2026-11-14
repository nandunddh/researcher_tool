export function LoadingIndicator({label="Loading"}:{label?:string}) {
  return <div className="loading-indicator" role="status" aria-live="polite"><span className="loading-ring" aria-hidden="true"/><span className="loading-accessible-label">{label}</span></div>;
}
