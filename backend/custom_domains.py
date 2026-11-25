"""Custom domains for published websites: validate the name, tell the owner which DNS records to add, and verify them.

A domain is "verified" once the TXT record at _sciprospect-verify.<hostname> holds the site's token (proof of control).
Whether the name also points at our servers is reported separately, so the owner can see both steps.
Serving a site on its own domain (HTTPS certificates, host routing) is a server-side step that is not part of this module.
"""
from __future__ import annotations

import ipaddress
import os
import re
import secrets
from typing import Callable, Optional
from urllib.parse import urlparse

import dns.exception
import dns.resolver
from psycopg2.errors import UniqueViolation

import db

VERIFY_LABEL = "_sciprospect-verify"
_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_TLD = re.compile(r"^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$")
_RESERVED_SUFFIXES = (".local", ".localhost", ".internal", ".test", ".example", ".invalid", ".lan", ".home.arpa")


def own_host() -> str:
    """The host customers point their domain at: where this application is served."""
    return (urlparse(os.environ.get("SCIPROSPECT_APP_URL", "")).hostname or "").lower()


def server_ip() -> str:
    """Optional fixed address for root domains, where a CNAME is not allowed. Empty when not configured."""
    return os.environ.get("SCIPROSPECT_SERVER_IP", "").strip()


def normalize(raw: str, own: Optional[str] = None) -> str:
    """The canonical lowercase ASCII hostname, or ValueError with a message for the customer."""
    own = own_host() if own is None else own
    text = (raw or "").strip().lower()
    if any(mark in text for mark in ("://", "/", ":", "@", " ", "?", "#")):
        raise ValueError("Enter only the domain name, for example events.myuniversity.edu (no https:// and no path).")
    text = text.rstrip(".")
    if not text:
        raise ValueError("Enter a domain name.")
    try:
        text = text.encode("idna").decode("ascii")
    except UnicodeError:
        raise ValueError("That domain name is not valid.")
    if len(text) > 253:
        raise ValueError("That domain name is too long.")
    try:
        ipaddress.ip_address(text)
    except ValueError:
        pass
    else:
        raise ValueError("Use a domain name, not an IP address.")
    labels = text.split(".")
    if len(labels) < 2 or not all(_LABEL.match(label) for label in labels) or not _TLD.match(labels[-1]):
        raise ValueError("That domain name is not valid.")
    if text.endswith(_RESERVED_SUFFIXES):
        raise ValueError("That domain name can't be used on the internet.")
    if own and (text == own or text.endswith("." + own)):
        raise ValueError("That is a SciProspect address. Use a domain you own.")
    return text


def records(hostname: str, token: str, own: Optional[str] = None, ip: Optional[str] = None) -> list[dict]:
    """The DNS records the owner adds at their domain provider."""
    own = own_host() if own is None else own
    ip = server_ip() if ip is None else ip
    out = [{"purpose": "verify", "type": "TXT", "name": f"{VERIFY_LABEL}.{hostname}", "value": token,
            "note": "Proves you own the domain."}]
    if own:
        out.append({"purpose": "route", "type": "CNAME", "name": hostname, "value": own,
                    "note": "Points the domain at your website. Use this for a name like www.example.org or events.example.org."})
    if ip:
        out.append({"purpose": "route", "type": "A", "name": hostname, "value": ip,
                    "note": "Use this instead of the CNAME when the domain is a root domain such as example.org."})
    return out


def _lookup(resolver, name: str, kind: str) -> list[str]:
    try:
        answers = resolver.resolve(name, kind, lifetime=5, search=False)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers, dns.exception.Timeout):
        return []
    out = []
    for item in answers:
        if kind == "TXT":
            out.append(b"".join(item.strings).decode("utf-8", "replace"))
        elif kind == "CNAME":
            out.append(str(item.target).rstrip(".").lower())
        else:
            out.append(str(item))
    return out


def check_dns(hostname: str, token: str, resolver, own: Optional[str] = None, ip: Optional[str] = None) -> dict:
    """{"verified": the TXT record holds the token, "pointing": the name leads to this application}."""
    own = own_host() if own is None else own
    ip = server_ip() if ip is None else ip
    verified = token in {value.strip() for value in _lookup(resolver, f"{VERIFY_LABEL}.{hostname}", "TXT")}
    pointing = bool(own) and own in _lookup(resolver, hostname, "CNAME")
    if not pointing and ip:
        pointing = ip in _lookup(resolver, hostname, "A")
    return {"verified": verified, "pointing": pointing}


def _row(row) -> Optional[dict]:
    if not row:
        return None
    site_id, hostname, token, verified_at = row
    return {"site_id": site_id, "hostname": hostname, "token": token, "verified": verified_at is not None}


def get(site_id: str) -> Optional[dict]:
    with db.transaction() as cur:
        cur.execute("SELECT site_id, hostname, token, verified_at FROM custom_domains WHERE site_id = %s", (site_id,))
        return _row(cur.fetchone())


def claim(site_id: str, hostname: str) -> dict:
    """Sets the site's domain (replacing any earlier one, which must be verified again). hostname is already normalised."""
    token = secrets.token_hex(16)
    with db.transaction() as cur:
        cur.execute("""INSERT INTO custom_domains (site_id, hostname, token) VALUES (%s, %s, %s)
                       ON CONFLICT (site_id) DO UPDATE SET hostname = EXCLUDED.hostname, token = EXCLUDED.token, verified_at = NULL, created_at = now()
                       RETURNING site_id, hostname, token, verified_at""", (site_id, hostname, token))
        return _row(cur.fetchone())


def release(site_id: str) -> bool:
    with db.transaction() as cur:
        cur.execute("DELETE FROM custom_domains WHERE site_id = %s", (site_id,))
        return cur.rowcount > 0


def verify(site_id: str, resolver_factory: Callable[[], object] = dns.resolver.Resolver) -> Optional[dict]:
    """Checks DNS for the site's domain and saves the result. Returns the domain with "pointing", or None if the site has none.
    Raises ValueError when another website has already verified this name."""
    current = get(site_id)
    if not current:
        return None
    found = check_dns(current["hostname"], current["token"], resolver_factory())
    if found["verified"] and not current["verified"]:
        try:
            with db.transaction() as cur:
                cur.execute("UPDATE custom_domains SET verified_at = now() WHERE site_id = %s AND token = %s", (site_id, current["token"]))
        except UniqueViolation:
            raise ValueError("Another website has already verified this domain.")
        current["verified"] = True
    return {**current, "pointing": found["pointing"]}
