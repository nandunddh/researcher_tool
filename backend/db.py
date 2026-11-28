"""
db.py
=====
PostgreSQL access for the SciProspect backend. PostgreSQL is the only store for
accounts, sessions, conferences and websites.

Connection settings come from environment variables (SCIPROSPECT_DB_HOST, _PORT,
_NAME, _USER, _PASSWORD). For local development they may be placed in
backend/.env, which is git-ignored and never committed. Values already set in
the environment win over the file.

All application tables live in their own schema (SCIPROSPECT_DB_SCHEMA, default
"scistudio"), separate from older tables and the lead-pipeline data in "public".
"""
from __future__ import annotations

import os
import re
import threading
from contextlib import contextmanager
from pathlib import Path
from time import monotonic
from typing import Iterator

ENV_FILE = Path(__file__).resolve().with_name(".env")
MIGRATIONS_DIR = Path(__file__).resolve().with_name("migrations")


def load_env_file(path: Path = ENV_FILE) -> None:
    """Loads KEY=VALUE lines from a local .env file without overriding real environment variables."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        m = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$", line)
        if not m or line.lstrip().startswith("#"):
            continue
        value = m.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(m.group(1), value)


load_env_file()

SCHEMA = os.environ.get("SCIPROSPECT_DB_SCHEMA", "scistudio")
if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", SCHEMA):
    raise RuntimeError("SCIPROSPECT_DB_SCHEMA must be a simple lowercase name.")


class DatabaseNotConfigured(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(os.environ.get("SCIPROSPECT_DB_HOST") and os.environ.get("SCIPROSPECT_DB_USER"))


_pool = None
# Re-entrant: ensure_migrated() holds it while _get_pool() may take it again.
_pool_lock = threading.RLock()
_migrated = False


def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is None:
            if not is_configured():
                raise DatabaseNotConfigured(
                    "Database is not configured. Set SCIPROSPECT_DB_HOST, SCIPROSPECT_DB_PORT, SCIPROSPECT_DB_NAME, "
                    "SCIPROSPECT_DB_USER and SCIPROSPECT_DB_PASSWORD (or add them to backend/.env)."
                )
            from psycopg2.pool import ThreadedConnectionPool
            _pool = ThreadedConnectionPool(
                1, int(os.environ.get("SCIPROSPECT_DB_POOL_MAX", "10")),
                host=os.environ["SCIPROSPECT_DB_HOST"],
                port=int(os.environ.get("SCIPROSPECT_DB_PORT") or 5432),
                dbname=os.environ.get("SCIPROSPECT_DB_NAME") or "postgres",
                user=os.environ["SCIPROSPECT_DB_USER"],
                password=os.environ.get("SCIPROSPECT_DB_PASSWORD", ""),
                connect_timeout=10,
                # TCP keepalives stop firewalls and the server from silently dropping idle connections.
                keepalives=1, keepalives_idle=60, keepalives_interval=10, keepalives_count=3,
                application_name="sciprospect-backend",
                options=f"-c search_path={SCHEMA}",
            )
    return _pool


# A connection idle longer than this is pinged before use: a dropped one still reports closed == 0 until it is used.
IDLE_CHECK_SECONDS = 60
_last_used: dict[int, float] = {}


def _usable(conn) -> bool:
    if conn.closed:
        return False
    if monotonic() - _last_used.get(id(conn), 0.0) < IDLE_CHECK_SECONDS:
        return True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.rollback()
        return True
    except Exception:
        return False


def _checkout(pool):
    """A live connection from the pool; dead ones are closed and replaced (each pooled one is tried at most once)."""
    for _ in range(pool.maxconn):
        conn = pool.getconn()
        if _usable(conn):
            return conn
        _last_used.pop(id(conn), None)
        pool.putconn(conn, close=True)
    return pool.getconn()  # every pooled connection was dead, so this one is newly opened


@contextmanager
def transaction() -> Iterator["psycopg2.extensions.cursor"]:  # type: ignore[name-defined]
    """Yields a cursor inside one transaction: committed on success, rolled back on error."""
    ensure_migrated()
    pool = _get_pool()
    conn = _checkout(pool)
    try:
        with conn:
            with conn.cursor() as cur:
                yield cur
    except Exception:
        # A broken connection must not go back into the pool.
        if conn.closed:
            _last_used.pop(id(conn), None)
        pool.putconn(conn, close=bool(conn.closed))
        raise
    else:
        _last_used[id(conn)] = monotonic()
        pool.putconn(conn)


def ensure_migrated() -> None:
    """Applies pending migrations once per process (safe to call often)."""
    global _migrated
    if _migrated:
        return
    with _pool_lock:
        if _migrated:
            return
        pool = _get_pool()
        conn = pool.getconn()
        try:
            with conn:
                with conn.cursor() as cur:
                    # Serialise concurrent workers starting at the same time.
                    cur.execute("SELECT pg_advisory_xact_lock(hashtext('sciprospect_migrations'))")
                    cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')
                    cur.execute(f'SET LOCAL search_path TO "{SCHEMA}"')
                    cur.execute(
                        "CREATE TABLE IF NOT EXISTS schema_migrations ("
                        " version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
                    )
                    cur.execute("SELECT version FROM schema_migrations")
                    done = {row[0] for row in cur.fetchall()}
                    for file in sorted(MIGRATIONS_DIR.glob("*.sql")):
                        if file.stem in done:
                            continue
                        cur.execute(file.read_text(encoding="utf-8"))
                        cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (file.stem,))
                        print(f"[DB] Applied migration {file.stem}")
        finally:
            pool.putconn(conn)
        _migrated = True
