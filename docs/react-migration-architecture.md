# React migration and scaling architecture

## Decision

Keep FastAPI and migrate frontend features into Next.js, React and TypeScript.
Preserve the existing visual design, URLs and saved document format. Use a modular
application first; do not create separate services for every feature.

Browser → Next.js UI / same-origin proxy → FastAPI → repositories and workers.

Next.js owns UI composition only. FastAPI authorizes every operation and resolves
the organization from the authenticated session. A URL, client-supplied organization
ID, or hidden button must never grant access. Root, organization, client and conference
namespaces remain UI routes, not security boundaries.

## Current delivered boundary

The React frontend runs separately on port 3000. Existing FastAPI remains on 8000.
Root overview, sign-in and the SciStudio website workspace are React components.
Other paths fall back to the existing app until their behavior has been migrated
and tested. No database, account or site records are rewritten in this step.
This stage is not a claim of production scale or complete UI migration.

## Module ownership

1. Identity: sessions, organizations, memberships, permission checks.
2. Studio: websites, versioned documents, component registry, media, publishing.
3. Events: conferences, speakers, schedules and eventual registration workflows.
4. Research: provider connectors, ingestion, provenance and deduplication.
5. Platform: plans, quotas, usage, audit events and provisioning.

Expose APIs between these modules. Do not let browser code access database credentials
or reuse root keys to call organization APIs. Use generated OpenAPI client types when
the existing dynamic API responses have explicit Pydantic response models; current
frontend interfaces are a hand-maintained compatibility boundary.

## Editor migration next

Introduce an editor store and controlled React section components behind a feature
flag. Keep stable component IDs and retain unknown fields from existing JSON. Build
typed property controls, selection, undo/redo, section ordering and element placement.
Test mobile positions independently. Add a tenant-scoped custom component library
only after document persistence and old-site round trips are reliable.

Do not switch the default editor until fixtures cover every current component,
rich text, image and logo settings, gradients, dynamic fields and free elements;
save/reload, preview and ZIP must agree. Existing Python rendering is retained until
output parity is demonstrated. Never evaluate customer JavaScript on the app origin.

## Database and concurrency phase

The present local JSON files, process-local state and optional database fallback
are not a horizontally scalable persistence system. Before multiple API replicas:

- Migrate authoritative identities, sessions, websites and jobs to PostgreSQL with
  explicit migrations, constraints and tested rollback/restore procedures.
- Add immutable organization IDs and ownership relationships; enforce them at every
  repository/API boundary. One organization is one tenant, not one conference.
- Decide and document shared versus per-tenant databases based on isolation and
  operating cost. Do not provision a database per conference.
- Add revision numbers/conditional saves so simultaneous editors cannot overwrite
  each other silently. Add idempotency keys to creates and publish actions.
- Use connection pooling and database-backed pagination rather than sending all
  accounts/sites to the browser. Current lists are still unpaginated.
- Move media out of embedded data URLs into tenant-scoped object storage with
  validated uploads and signed access where needed.

## Jobs and publishing phase

Run collection, exports and publishing in durable worker queues, not API worker
memory. Store job state centrally, retry transient errors with backoff, enforce
provider quotas, and attach organization IDs to every job. Web workers must become
stateless before increasing replicas. Separate public published assets from the
authenticated editor and serve versioned assets through caching/CDN when warranted.

## Security and operations gates

- Backend session authorization tests must cover root/owner/member/other-tenant cases.
- Audit the existing password-reset endpoint: proof of email ownership is required
  before resetting a password; an email-existence check alone is insufficient.
- Audit existing authentication responses and logs for credentials; use Secure cookies
  under HTTPS, CSRF protection for cookie-authenticated writes, and login rate limits.
- Test custom HTML, media URLs and published output sanitization; do not claim that
  frontend escaping alone secures legacy compiler output.
- Enforce storage, API and seat quotas server-side; record audit actions with request IDs.
- Add health/readiness checks, latency/error metrics, restore drills and load tests
  using measured traffic. Do not promise a supported user count before benchmarking.
- Keep the old UI available until the React routes pass browser checks, accessibility,
  role isolation, refresh/back navigation and production build verification.

## Rollback

The old `run_web.bat` and port 8000 remain available. Stop using port 3000 to return
to the existing UI. The only session API addition is the additive
`user.workspace_namespace` field. No source or data deletion is required.
