"""Cloudflare Turnstile: proves a public form was sent by a person.

Switched on when both keys are set (SCIPROSPECT_TURNSTILE_SITE_KEY and SCIPROSPECT_TURNSTILE_SECRET_KEY,
from the Cloudflare dashboard). Without them forms work as before, so local development needs no Cloudflare account.
"""
from __future__ import annotations

import json
import os
from typing import Callable, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
MAX_TOKEN = 2048


def site_key() -> str:
    return os.environ.get("SCIPROSPECT_TURNSTILE_SITE_KEY", "").strip()


def _secret() -> str:
    return os.environ.get("SCIPROSPECT_TURNSTILE_SECRET_KEY", "").strip()


def enabled() -> bool:
    return bool(site_key() and _secret())


def verify(token: object, remote_ip: Optional[str] = None, opener: Callable = urlopen) -> bool:
    """True when Cloudflare confirms the token (or Turnstile is not configured). Any error counts as not confirmed."""
    if not enabled():
        return True
    if not isinstance(token, str) or not token or len(token) > MAX_TOKEN:
        return False
    fields = {"secret": _secret(), "response": token}
    if remote_ip:
        fields["remoteip"] = remote_ip
    request = Request(SITEVERIFY, data=urlencode(fields).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with opener(request, timeout=6) as response:
            return json.loads(response.read().decode("utf-8")).get("success") is True
    except Exception:  # Cloudflare unreachable or an unexpected answer: refuse rather than let bots through
        return False
