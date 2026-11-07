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

## Product direction discussed with the owner

SciStudio is the current priority. Clients should be able to create their own
conference websites through a guided brief and then edit a generated preview in
the visual builder. The brief can collect name, dates, venue, deadlines, prizes,
speakers and optional sections. Ask only relevant questions and allow clients to
supply missing details later. The design direction includes many selectable
layouts per section, direct customization, reusable conference and speaker data,
and preview, published output and export that agree. Existing dummy templates
are candidates for replacement after the new flow is ready, not deletion now.

Each client organization can manage multiple conference websites. SciProspect
provides hosting on its own server, so clients do not need to run their own
server. Give each website a unique platform-owned temporary address, then allow
the client to connect their own purchased domain. Domain purchase is outside the
current product. Domain verification, routing, HTTPS, storage, isolation and
operational hosting remain future implementation work. Temporary addresses and
hosting are not yet established by this document.

The intended account model includes one or more platform root users, client
organization owners/managers and conference-scoped subaccounts. Individual
permissions are future work; website building takes priority for now.

Work in small, independently testable tasks. The owner wants a proposed task and
an opportunity to adjust it before an implementation prompt is prepared for
Antigravity. Initial task: a brief form with a review screen, preserving inputs
and marking missing optional fields. Preview generation and publishing follow in
separate tasks.

## Homepage section library
The owner described optional, reorderable homepage sections: top contact or
 deadline ribbon; navigation; hero with buttons that can open database-backed
forms; announcement ribbon; about; highlights (editions, experience, delegates,
participants and countries); scientific sessions; speakers, plenary and
committee profiles with a view-more action; pricing; custom sections such as
countdown, invitations and prizes; testimonials; contact form; footer with logo,
introduction, links, subscription and optional map; and a bottom legal ribbon.
Add partnership, exhibitors, past exhibitors and supporters as additional
section types. Clients select from multiple designs for each section and use
drag-and-drop to arrange them. Target a growing library of 5–10 or more designs
per section over time. AI assistance is a future possibility, not a current
requirement. Form submission storage needs to be built and tested.

## Editor update — 7 November 2026

Implemented locally: section drag/reorder in canvas and outline; searchable
palette; duplicate; undo/redo (100 states); unsaved-change warnings; save status;
Ctrl/Cmd+S; preview saves before opening; in-flight saves preserve newer edits.
Six hero layouts retain content. New about, stats, agenda, sponsors/exhibitors,
testimonials and announcement sections each support grid, list and spotlight.
Section outer spacing, radius, background and site font/theme settings persist.
Custom HTML/CSS embeds use sandboxed iframes without scripts. The compiler carries
these additions into published HTML and ZIP output.

Validation: pure compiler tests and mocked editor behavior tests pass. Browser
visual/interaction verification remains pending. Existing contact forms still
lack database submission storage. This is a section-based builder, not arbitrary
nested element editing or full WordPress/Webflow feature parity. Shared media
uploads, centralized speaker management, full layout libraries for every section,
custom-domain provisioning and lead capture remain future work.

## Editor interaction refinement — 7 November 2026

Added a searchable visual section dialog and insertion buttons between sections;
Content / Design / Advanced inspector tabs; visual hero and generic-section
layout cards; independent panel toggles; tablet viewport and explicit zoom;
inline editing for unambiguous text fields (double-click or Enter, Escape cancels);
image-click focus into existing image settings; section appearance sliders,
reset, and whole-section visibility. Hidden sections remain editable in the
outline and are omitted by the website compiler. Custom code lives in Advanced.

New interaction checks cover inline commit/cancel and nested fields, ambiguous
text exclusion, viewport sizes/zoom, and hidden output. Existing editor history,
save-race, and compiler checks pass. These are local automated checks, not a
completed browser visual acceptance pass. Image selection still uses the existing
URL controls; asset upload/cropping and per-device style overrides are not added.
