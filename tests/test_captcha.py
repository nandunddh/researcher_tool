"""Cloudflare Turnstile: off without keys; with keys, only a token Cloudflare confirms lets a demo request through."""
import asyncio
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app as web_app  # noqa: E402


async def _inline(fn, *args):
    """Runs the background-thread helper inline, because these tests replace threading.Thread."""
    return fn(*args)
import captcha  # noqa: E402
import demo_requests  # noqa: E402

KEYS = {"SCIPROSPECT_TURNSTILE_SITE_KEY": "site-123", "SCIPROSPECT_TURNSTILE_SECRET_KEY": "secret-456"}
NO_KEYS = {"SCIPROSPECT_TURNSTILE_SITE_KEY": "", "SCIPROSPECT_TURNSTILE_SECRET_KEY": ""}


def cloudflare(answer, calls=None):
    """A stand-in for urlopen that records what was sent and answers like Cloudflare."""
    def opener(request, timeout):
        if calls is not None:
            calls.append((request.full_url, parse_qs(request.data.decode()), timeout))
        if isinstance(answer, Exception):
            raise answer
        return io.BytesIO(json.dumps(answer).encode())
    return opener


class VerifyTests(unittest.TestCase):
    def test_off_without_both_keys(self):
        for env in (NO_KEYS, {**KEYS, "SCIPROSPECT_TURNSTILE_SECRET_KEY": ""}, {**KEYS, "SCIPROSPECT_TURNSTILE_SITE_KEY": " "}):
            with patch.dict(os.environ, env):
                self.assertFalse(captcha.enabled())
                self.assertTrue(captcha.verify(None, opener=cloudflare(Exception("never called"))))

    def test_a_confirmed_token_passes_and_the_secret_is_sent(self):
        calls = []
        with patch.dict(os.environ, KEYS):
            self.assertTrue(captcha.verify("tok", "1.2.3.4", opener=cloudflare({"success": True}, calls)))
        url, fields, timeout = calls[0]
        self.assertEqual(url, captcha.SITEVERIFY)
        self.assertEqual(fields, {"secret": ["secret-456"], "response": ["tok"], "remoteip": ["1.2.3.4"]})
        self.assertLessEqual(timeout, 10)

    def test_anything_else_is_refused(self):
        with patch.dict(os.environ, KEYS):
            for token in (None, "", 7, "x" * (captcha.MAX_TOKEN + 1)):
                self.assertFalse(captcha.verify(token, opener=cloudflare({"success": True})), repr(token)[:20])
            for answer in ({"success": False}, {"success": "true"}, {}, OSError("network down"), ValueError("bad json")):
                self.assertFalse(captcha.verify("tok", opener=cloudflare(answer)), repr(answer))


class _Req:
    def __init__(self, payload):
        self._payload, self.headers, self.client = payload, {}, SimpleNamespace(host="10.0.0.9")

    async def json(self):
        return self._payload


GOOD = {"name": "Ada", "email": "ada@lab.org"}


class DemoRouteTests(unittest.TestCase):
    def setUp(self):
        web_app._demo_limit = web_app.FormRateLimit(limit=50, seconds=900)

    def send(self, payload, confirmed):
        saved = []
        with patch.object(captcha, "verify", side_effect=lambda token, ip: confirmed), patch.object(demo_requests, "save", side_effect=lambda v: saved.append(v) or 1), \
             patch.object(web_app.threading, "Thread", lambda **k: SimpleNamespace(start=lambda: None)), \
             patch.object(web_app, "run_in_threadpool", _inline):
            return asyncio.run(web_app.public_demo_request(_Req(payload))), saved

    def test_unconfirmed_requests_are_not_saved(self):
        with self.assertRaises(HTTPException) as ctx:
            self.send({**GOOD, "captcha": "bad"}, confirmed=False)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("person", ctx.exception.detail)

    def test_confirmed_requests_are_saved(self):
        out, saved = self.send({**GOOD, "captcha": "good"}, confirmed=True)
        self.assertEqual((out["status"], len(saved)), ("ok", 1))

    def test_the_site_key_is_shared_only_when_the_check_is_on(self):
        with patch.dict(os.environ, KEYS):
            self.assertEqual(asyncio.run(web_app.public_captcha()), {"site_key": "site-123"})
        with patch.dict(os.environ, NO_KEYS):
            self.assertEqual(asyncio.run(web_app.public_captcha()), {"site_key": ""})


if __name__ == "__main__":
    unittest.main()
