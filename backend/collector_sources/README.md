# Collector sources

Scripts the web collector runs (moved from the retired desktop app's `app/main`).

- `collect_all.py`: `load_source(filename)` loads one source script and returns its `run(...)`.
- `03_unified_lead_pipeline.py`: OpenAlex source.
- `06_extract_biorxiv_researchers.py`: bioRxiv source.
- `04_extract_nih_researchers.py`: NIH RePORTER (for the upcoming NIH Grant PIs feature).
- `collector_store.py`: record fields and normalising.
- `collector_identity.py`: matching an email to the author's name.

`backend/app.py` puts this folder on `sys.path`, so the scripts import each other by name. `app_config` comes from `backend/app_config.py`.
