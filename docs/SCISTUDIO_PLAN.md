# SciStudio implementation plan

## Product structure
One organization owns conferences, sites and assets. The existing account becomes
its Owner membership. Staff receive their own user accounts; they are assigned to
one or more conferences. A conference is a workspace, not a shared login.
Start with one organization; retain organization IDs in all records for future growth.
Platform administrator access is separate from organization ownership.

Organization -> conferences -> websites / assets / future leads and registrations.
Users -> memberships -> roles, optionally scoped to individual conferences.
Use immutable IDs, not email addresses, as ownership keys.

## Delivery order and acceptance criteria
1. Immediate builder stabilization: enforce site ownership, private drafts, save
   before publish/export. These initial guards are implemented. Verify editor
   controls, section ordering, mobile preview and template rendering in browser.
2. Organization and conference foundation: organizations, users, memberships,
   conferences and website associations. Migrate current owner/sites transactionally
   with a backup and a dry-run report. Existing websites must still open and export.
   Roles: Owner, organization Admin, conference Manager, Editor and Viewer.
   Owner manages organization and staff; Managers manage assigned conferences;
   Editors edit drafts; Viewers view authorized content. Publishing is explicit.
   Test cross-organization and cross-conference isolation on every API action.
3. Conference-first dashboard: conference switcher, conference cards, dates, venue,
   site status, last saved time and team. Create Conference -> details -> template
   -> editor. Show only sections available to the signed-in user's memberships.
4. Reliable editor: conference content model (overview, speakers, agenda, venue,
   sponsors, committee, submission and registration links). Add media storage,
   autosave with visible failure/retry, undo/redo, optimistic revision checks,
   duplicate conference/site and desktop/tablet/mobile preview.
5. Publishing: separate draft revisions from immutable published releases; saving
   a published site must not alter its live release. Add preview authorization,
   publish validation, rollback and audit history. Validate slugs and avoid collisions.
   Choose explicit storage mode; do not report successful cloud saves when only a
   local fallback succeeded. Host public sites on a separate origin with safe
   content rendering and verified domain/HTTPS provisioning. localhost URLs are
   previews, not internet hosting. Domain fields alone do not configure domains.
6. Later: attach collector results to conferences through lead assignments (one
   researcher may belong to multiple conferences). Then add lead tracking,
   registrations, forms, analytics and optional integrations as separate milestones.

## Suggested data entities
organizations; users; organization_memberships; conferences; conference_memberships;
websites; website_revisions; published_releases; assets; audit_events.
Each conference/site belongs to one organization; conference membership gives
scoped access. Keep the platform licensing model separate from staff permissions.

## Current limitations and remaining work
The existing site model uses user_email and has no organization or conference
membership layer. Current fixes retain legacy admin access; they do not implement
multi-tenant permissions. Draft/public separation is currently a status guard;
immutable releases are still needed because editing a published site recompiles
its served HTML. Live sites and editor output need security and rendering review
before production deployment. The current frontend and backend have different
rendering paths; compare them before claiming preview/export parity.

## Immediate validation
Automated ownership and draft-publication tests; existing regression suite;
JavaScript/Python syntax checks. Browser verification and live publishing have
not been completed. No user accounts or existing sites migrated in this step.
