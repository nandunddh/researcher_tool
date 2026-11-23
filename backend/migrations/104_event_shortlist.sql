-- Private shortlist of researchers an organiser may invite as speakers. Never shown on the public website:
-- only people the organiser explicitly adds to the event's speakers appear there (via Event details).
-- Deleted with the website.
CREATE TABLE IF NOT EXISTS event_shortlist (
    site_id text NOT NULL REFERENCES websites(site_id) ON DELETE CASCADE,
    email text NOT NULL,
    name text NOT NULL,
    affiliation text NOT NULL DEFAULT '',
    orcid text NOT NULL DEFAULT '',
    source text NOT NULL DEFAULT '',
    paper_title text NOT NULL DEFAULT '',
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, email)
);
