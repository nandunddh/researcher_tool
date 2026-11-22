import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

import app as web_app
import mfa
from license_manager import LicenseManager


class _Req:
    def __init__(self, payload):
        self._payload, self.url, self.headers, self.client, self.cookies = payload, SimpleNamespace(scheme="http"), {}, None, {}

    async def json(self):
        return self._payload


class TotpTests(unittest.TestCase):
    SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # RFC 6238 test key "12345678901234567890"

    def test_rfc_vector(self):
        self.assertEqual(mfa.totp(self.SECRET, 59 // 30), "287082")
        self.assertEqual(mfa.totp(self.SECRET, 1111111109 // 30), "081804")

    def test_window_and_replay(self):
        now = 1111111109
        code = mfa.totp(self.SECRET, now // 30)
        self.assertEqual(mfa.matching_step(self.SECRET, code, 0, now), now // 30)
        self.assertEqual(mfa.matching_step(self.SECRET, code, 0, now + 30), now // 30, "one step of clock drift")
        self.assertIsNone(mfa.matching_step(self.SECRET, code, 0, now + 90), "too old")
        self.assertIsNone(mfa.matching_step(self.SECRET, code, now // 30, now), "already used")
        self.assertIsNone(mfa.matching_step(self.SECRET, "12345", 0, now))

    def test_backup_codes_are_hashed(self):
        codes, hashes = mfa.new_backup_codes()
        self.assertEqual(len(set(codes)), mfa.BACKUP_COUNT)
        self.assertNotIn(codes[0], hashes)
        self.assertEqual(mfa._backup_hash(codes[0].upper()), hashes[0])


class LoginWithMfaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mgr = LicenseManager(db_path=Path(self.tmp.name) / "l.json", sessions_path=Path(self.tmp.name) / "s.json")
        self.acc = self.mgr.create_account(name="Jane", email="jane@university.edu", account_type="org", org_name="Lab",
                                           tier="pro", seat_limit=5, password="OldPassword1!")
        web_app._mfa_challenges.clear()

    def tearDown(self):
        self.tmp.cleanup()

    def _login(self, enabled):
        fake = SimpleNamespace(is_enabled=lambda key: key in enabled, verify=lambda key, code: code == "123456")
        return patch.object(web_app, "license_engine", self.mgr), patch.dict(sys.modules, {"mfa": fake})

    def test_without_mfa_signs_in_directly(self):
        a, b = self._login(set())
        with a, b:
            res = asyncio.run(web_app.api_auth_login(_Req({"identifier": "jane@university.edu", "password": "OldPassword1!"})))
        self.assertIn("scip_token=", res.headers.get("set-cookie", ""))

    def test_mfa_needs_code_and_limits_tries(self):
        a, b = self._login({f"{self.acc['license_key']}:"})
        with a, b:
            first = asyncio.run(web_app.api_auth_login(_Req({"identifier": "jane@university.edu", "password": "OldPassword1!"})))
            self.assertEqual(first["status"], "mfa_required", "no session before the code")
            token = first["mfa_token"]
            with self.assertRaises(HTTPException) as err:
                asyncio.run(web_app.api_auth_login_mfa(_Req({"mfa_token": token, "code": "000000"})))
            self.assertEqual(err.exception.status_code, 400)
            done = asyncio.run(web_app.api_auth_login_mfa(_Req({"mfa_token": token, "code": "123456"})))
            self.assertEqual(done.status_code, 200)
            with self.assertRaises(HTTPException):
                asyncio.run(web_app.api_auth_login_mfa(_Req({"mfa_token": token, "code": "123456"})))  # challenge used up

            token = asyncio.run(web_app.api_auth_login(_Req({"identifier": "jane@university.edu", "password": "OldPassword1!"})))["mfa_token"]
            for _ in range(4):
                with self.assertRaises(HTTPException):
                    asyncio.run(web_app.api_auth_login_mfa(_Req({"mfa_token": token, "code": "000000"})))
            with self.assertRaises(HTTPException) as err:
                asyncio.run(web_app.api_auth_login_mfa(_Req({"mfa_token": token, "code": "000000"})))
            self.assertIn("Too many", err.exception.detail)
            with self.assertRaises(HTTPException):
                asyncio.run(web_app.api_auth_login_mfa(_Req({"mfa_token": token, "code": "123456"})))


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_"), "Database test: set SCIPROSPECT_DB_SCHEMA=test_<name> (never the live data).")
class MfaDbTests(unittest.TestCase):
    def test_setup_enable_verify_disable(self):
        key = "test-key:"
        mfa.disable(key, "x")
        setup = mfa.start_setup(key, "t@example.org")
        self.assertTrue(setup["qr"].startswith("data:image/svg+xml"))
        self.assertIsNone(mfa.enable(key, "000000"))
        codes = mfa.enable(key, mfa.totp(setup["secret"], int(__import__("time").time() // 30)))
        self.assertEqual(len(codes), mfa.BACKUP_COUNT)
        self.assertIsNone(mfa.start_setup(key, "t@example.org"), "can't silently replace an active secret")
        self.assertTrue(mfa.verify(key, codes[0]))
        self.assertFalse(mfa.verify(key, codes[0]), "backup code works once")
        self.assertTrue(mfa.disable(key, codes[1]))
        self.assertFalse(mfa.is_enabled(key))


if __name__ == "__main__":
    unittest.main()


class AdminResetTests(unittest.TestCase):
    def test_root_resets_a_client(self):
        removed = []
        fake = SimpleNamespace(reset=lambda key: removed.append(key) or key == "KEY1:mem-1", enabled_keys=lambda: ["__root__", "KEY1:"])
        with patch.dict(sys.modules, {"mfa": fake}), patch.object(web_app, "_verify_admin_auth", lambda r: None):
            self.assertEqual(asyncio.run(web_app.admin_mfa_status(_Req({})))["enabled"], ["KEY1:"], "root's own key is not listed")
            ok = asyncio.run(web_app.admin_mfa_reset(_Req({"license_key": "KEY1", "member_id": "mem-1"})))
            self.assertEqual(ok["status"], "ok")
            for body in ({"license_key": "KEY1"}, {"license_key": "SCIP-PRO-ROOT-MASTER"}, {}):
                with self.assertRaises(HTTPException):
                    asyncio.run(web_app.admin_mfa_reset(_Req(body)))
        self.assertEqual(removed, ["KEY1:mem-1", "KEY1:"])

    def test_only_root(self):
        def deny(request):
            raise HTTPException(status_code=403, detail="no")
        with patch.object(web_app, "_verify_admin_auth", deny):
            with self.assertRaises(HTTPException):
                asyncio.run(web_app.admin_mfa_reset(_Req({"license_key": "KEY1"})))
