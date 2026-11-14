"""Root account regression tests. Temporary storage only; cloud connections disabled.
Authorization tests execute the actual guard in isolation, not a running server.
"""
import ast
import contextlib
import io
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import license_manager as lm

class RootAccountTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "tests")
        self.addCleanup(self.temp.cleanup)
        self.cloud = patch.dict(lm.PG_CONFIG, {"host": ""})
        self.cloud.start()
        self.addCleanup(self.cloud.stop)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)
        base = Path(self.temp.name)
        self.manager = lm.LicenseManager(base / "licenses.json", base / "sessions.json")
        self.account = self.manager.create_account(name="Test Owner", email="owner@example.test", account_type="org", org_name="Test Research", seat_limit=1)
        self.key = self.account["license_key"]

    def test_created_account_persists(self):
        restored = lm.LicenseManager(self.manager.db_path, self.manager.sessions_path)
        self.assertEqual(restored.get_account(self.key)["org_name"], "Test Research")

    def test_duplicate_email_case_and_whitespace_rejected(self):
        with self.assertRaises(ValueError):
            self.manager.create_account(name="Duplicate", email=" OWNER@example.test ")

    def test_search_and_status_filters(self):
        self.assertEqual(len(self.manager.list_accounts(search="test research")), 1)
        self.manager.stop_account(self.key)
        self.assertEqual(len(self.manager.list_accounts(search="owner@example.test", filter_status="active")), 0)
        self.assertEqual(len(self.manager.list_accounts(search="owner@example.test", filter_status="stopped")), 1)

    def test_suspend_resume(self):
        self.assertTrue(self.manager.stop_account(self.key)[0])
        self.assertEqual(self.manager.get_account(self.key)["status"], "stopped")
        self.assertTrue(self.manager.resume_account(self.key)[0])
        self.assertEqual(self.manager.get_account(self.key)["status"], "active")

    def test_extend_adds_seven_days(self):
        before = self.manager.get_account(self.key)["expires_at"]
        ok, _, account = self.manager.extend_account(self.key, 7)
        fmt = "%Y-%m-%d %H:%M:%S UTC"
        self.assertTrue(ok)
        self.assertEqual((datetime.strptime(account["expires_at"], fmt)-datetime.strptime(before, fmt)).days, 7)

    def test_plan_and_limit_update(self):
        ok, _, account = self.manager.upgrade_account(self.key, "pro", 250)
        self.assertTrue(ok)
        self.assertEqual((account["tier"], account["daily_limit"]), ("pro", 250))

    def test_pro_creation_is_monthly_even_with_lifetime_requested(self):
        account = self.manager.create_account(name="Monthly", email="monthly@example.test", tier="pro", duration_days=-1)
        fmt = "%Y-%m-%d %H:%M:%S UTC"
        self.assertEqual(account["duration_days"], 30)
        self.assertEqual((datetime.strptime(account["expires_at"], fmt)-datetime.strptime(account["created_at"], fmt)).days, 30)

    def test_pro_upgrade_is_monthly_and_quota_edit_does_not_renew(self):
        ok, _, account = self.manager.upgrade_account(self.key, "pro", 250)
        self.assertTrue(ok)
        self.assertEqual(account["duration_days"], 30)
        self.assertNotEqual(account["expires_at"], "never")
        expiry = account["expires_at"]
        self.manager.upgrade_account(self.key, "pro", 500)
        self.assertEqual(self.manager.get_account(self.key)["expires_at"], expiry)

    def test_studio_toggle_persists(self):
        self.assertTrue(self.manager.toggle_scistudio_access(self.key, False)[0])
        self.assertFalse(self.manager.get_account(self.key)["scistudio_access"])
        self.assertTrue(self.manager.toggle_scistudio_access(self.key, True)[0])
        self.assertTrue(self.manager.get_account(self.key)["scistudio_access"])

    def test_member_lifecycle_and_seat_limit(self):
        ok, _, member = self.manager.add_org_member(self.key, "Editor", "editor@example.test", role="editor")
        self.assertTrue(ok)
        self.assertEqual(member["role"], "editor")
        self.assertFalse(self.manager.add_org_member(self.key, "Extra", "extra@example.test")[0])
        self.assertTrue(self.manager.toggle_member_scistudio(self.key, member["member_id"], False)[0])
        self.assertFalse(self.manager.get_account(self.key)["members"][0]["scistudio_access"])
        self.assertTrue(self.manager.remove_org_member(self.key, member["member_id"])[0])
        self.assertEqual(self.manager.get_account(self.key)["members"], [])

    def test_missing_accounts_fail(self):
        for method in (self.manager.stop_account, self.manager.resume_account, self.manager.extend_account, self.manager.upgrade_account, self.manager.toggle_scistudio_access):
            with self.subTest(method=method.__name__):
                self.assertFalse(method("missing")[0])

    def test_root_cannot_be_deleted_suspended_or_disabled(self):
        key = "SCIP-PRO-ROOT-MASTER"
        self.assertFalse(self.manager.delete_account(key)[0])
        self.assertFalse(self.manager.stop_account(key)[0])
        self.assertFalse(self.manager.toggle_scistudio_access(key, False)[0])
        root = self.manager.get_account(key)
        self.assertIsNotNone(root)
        self.assertEqual(root["status"], "active")
        self.assertTrue(root.get("scistudio_access", True))

class RootGuardTests(unittest.TestCase):
    def guard(self, user, header="", valid_header=False):
        from fastapi import HTTPException
        tree = ast.parse((ROOT / "backend/app.py").read_text(encoding="utf-8"))
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_verify_admin_auth")
        scope = {"Request": object, "HTTPException": HTTPException,
                 "license_engine": SimpleNamespace(verify_root_auth=lambda value: valid_header),
                 "_get_current_user_from_request": lambda request: user}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "backend/app.py", "exec"), scope)
        return scope["_verify_admin_auth"](SimpleNamespace(headers={"X-Root-Auth": header}))

    def test_root_session_allowed(self):
        self.guard({"is_admin": True})

    def test_other_roles_and_anonymous_denied(self):
        from fastapi import HTTPException
        for user in (None, {"is_admin":False}, {"is_member":True,"role":"admin"}, {"role":"editor"}, {"role":"viewer"}):
            with self.subTest(user=user), self.assertRaises(HTTPException) as caught:
                self.guard(user)
            self.assertEqual(caught.exception.status_code, 401)

    def test_invalid_root_header_denied(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException): self.guard(None, "invalid")


class _FakeRequest:
    def __init__(self, payload=None, user=None, headers=None, cookies=None):
        self._payload = payload or {}
        self._user = user
        self.headers = headers or {}
        self.cookies = cookies or {}

    async def json(self):
        return self._payload


class RealEndpointWorkflowTests(unittest.TestCase):
    def setUp(self):
        import asyncio
        self.async_run = asyncio.run
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "tests")
        self.addCleanup(self.temp.cleanup)
        self.cloud = patch.dict(lm.PG_CONFIG, {"host": ""})
        self.cloud.start()
        self.addCleanup(self.cloud.stop)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

        base = Path(self.temp.name)
        self.manager = lm.LicenseManager(base / "licenses.json", base / "sessions.json")
        import app as web_app
        self.web_app = web_app
        self.engine_patch = patch.object(web_app, "license_engine", self.manager)
        self.engine_patch.start()
        self.addCleanup(self.engine_patch.stop)

        self.root_user = {"client_email": "root@sciprospect.internal", "is_admin": True}
        self.client_user = {"client_email": "client@example.test", "is_admin": False}

        self.account = self.manager.create_account(
            name="Lab Director",
            email="director@example.test",
            account_type="org",
            org_name="Director Lab",
            seat_limit=1,
        )
        self.key = self.account["license_key"]

    def _req(self, payload=None, user=None):
        u = self.root_user if user is None else user
        return _FakeRequest(payload=payload, user=u)

    def test_endpoints_deny_non_root_and_anonymous(self):
        from fastapi import HTTPException
        for bad_user in (None, self.client_user, {"is_admin": False, "role": "editor"}):
            with self.subTest(user=bad_user):
                with patch.object(self.web_app, "_get_current_user_from_request", return_value=bad_user):
                    req = _FakeRequest(user=bad_user)
                    with self.assertRaises(HTTPException) as ctx:
                        self.async_run(self.web_app.admin_list_licenses(req))
                    self.assertEqual(ctx.exception.status_code, 401)

                    with self.assertRaises(HTTPException) as ctx:
                        self.async_run(self.web_app.admin_create_license(req))
                    self.assertEqual(ctx.exception.status_code, 401)

                    with self.assertRaises(HTTPException) as ctx:
                        self.async_run(self.web_app.admin_stop_license(req))
                    self.assertEqual(ctx.exception.status_code, 401)

                    with self.assertRaises(HTTPException) as ctx:
                        self.async_run(self.web_app.admin_delete_license(self.key, req))
                    self.assertEqual(ctx.exception.status_code, 401)

    def test_real_endpoint_create_and_duplicate_rejection(self):
        from fastapi import HTTPException
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.root_user):
            req = self._req({
                "name": "Dr. Watson",
                "email": "watson@example.test",
                "tier": "pro",
                "duration_days": 30,
                "account_type": "single",
                "daily_limit": 500,
            })
            res = self.async_run(self.web_app.admin_create_license(req))
            self.assertEqual(res["status"], "active")
            created_key = res["license_key"]
            self.assertIsNotNone(self.manager.get_account(created_key))

            # Duplicate email raises 409
            dup_req = self._req({
                "name": "Watson Duplicate",
                "email": " WATSON@example.test ",
                "tier": "trial",
            })
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_create_license(dup_req))
            self.assertEqual(ctx.exception.status_code, 409)

    def test_real_endpoint_suspend_resume_extend_upgrade(self):
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.root_user):
            # Stop
            stop_res = self.async_run(self.web_app.admin_stop_license(self._req({"license_key": self.key})))
            self.assertEqual(stop_res["status"], "ok")
            self.assertEqual(self.manager.get_account(self.key)["status"], "stopped")

            # Resume
            resume_res = self.async_run(self.web_app.admin_resume_license(self._req({"license_key": self.key})))
            self.assertEqual(resume_res["status"], "ok")
            self.assertEqual(self.manager.get_account(self.key)["status"], "active")

            # Extend
            extend_res = self.async_run(self.web_app.admin_extend_license(self._req({"license_key": self.key, "additional_days": 7})))
            self.assertEqual(extend_res["status"], "ok")

            # Upgrade
            upgrade_res = self.async_run(self.web_app.admin_upgrade_license(self._req({"license_key": self.key, "new_tier": "pro", "new_limit": 1500})))
            self.assertEqual(upgrade_res["status"], "ok")
            self.assertEqual(self.manager.get_account(self.key)["tier"], "pro")
            self.assertEqual(self.manager.get_account(self.key)["daily_limit"], 1500)

            # Toggle studio
            studio_res = self.async_run(self.web_app.admin_toggle_scistudio(self._req({"license_key": self.key, "enabled": False})))
            self.assertEqual(studio_res["status"], "ok")
            self.assertFalse(self.manager.get_account(self.key)["scistudio_access"])

    def test_real_endpoint_destructive_actions_on_root_master_rejected(self):
        from fastapi import HTTPException
        root_key = "SCIP-PRO-ROOT-MASTER"
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.root_user):
            # Delete root -> 400
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_delete_license(root_key, self._req()))
            self.assertEqual(ctx.exception.status_code, 400)

            # Suspend root -> 400
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_stop_license(self._req({"license_key": root_key})))
            self.assertEqual(ctx.exception.status_code, 400)

            # Disable studio for root -> 400
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_toggle_scistudio(self._req({"license_key": root_key, "enabled": False})))
            self.assertEqual(ctx.exception.status_code, 400)

            # Verify root remains intact
            root_acc = self.manager.get_account(root_key)
            self.assertEqual(root_acc["status"], "active")
            self.assertTrue(root_acc.get("scistudio_access", True))

    def test_real_endpoint_member_lifecycle_and_deletion(self):
        from fastapi import HTTPException
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.root_user):
            # Add member
            add_res = self.async_run(self.web_app.admin_add_org_member(self._req({
                "license_key": self.key,
                "name": "Member A",
                "email": "membera@example.test",
                "role": "editor",
            })))
            self.assertEqual(add_res["status"], "ok")
            member_id = add_res["member"]["member_id"]

            # Adding 2nd member when limit is 1 raises 400
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_add_org_member(self._req({
                    "license_key": self.key,
                    "name": "Member B",
                    "email": "memberb@example.test",
                })))
            self.assertEqual(ctx.exception.status_code, 400)

            # Toggle member studio
            tog_res = self.async_run(self.web_app.admin_toggle_member_scistudio(self._req({
                "license_key": self.key,
                "member_id": member_id,
                "enabled": False,
            })))
            self.assertEqual(tog_res["status"], "ok")

            # Remove member
            rem_res = self.async_run(self.web_app.admin_remove_org_member(self._req({
                "license_key": self.key,
                "member_id": member_id,
            })))
            self.assertEqual(rem_res["status"], "ok")
            self.assertEqual(self.manager.get_account(self.key)["members"], [])

            # Delete account
            del_res = self.async_run(self.web_app.admin_delete_license(self.key, self._req()))
            self.assertEqual(del_res["status"], "ok")
            self.assertIsNone(self.manager.get_account(self.key))

    def test_real_endpoint_validation_errors_return_400_not_500(self):
        from fastapi import HTTPException
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.root_user):
            # Invalid tier
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_create_license(self._req({
                    "name": "Bad Tier", "email": "badtier@example.test", "tier": "superpro"
                })))
            self.assertEqual(ctx.exception.status_code, 400)

            # Invalid duration
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_create_license(self._req({
                    "name": "Bad Duration", "email": "baddur@example.test", "tier": "trial", "duration_days": "not-a-number"
                })))
            self.assertEqual(ctx.exception.status_code, 400)

            # Invalid daily limit
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_create_license(self._req({
                    "name": "Bad Limit", "email": "badlim@example.test", "tier": "pro", "daily_limit": -99
                })))
            self.assertEqual(ctx.exception.status_code, 400)

            # Invalid seat limit
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_create_license(self._req({
                    "name": "Bad Seats", "email": "badseat@example.test", "account_type": "org", "seat_limit": "invalid"
                })))
            self.assertEqual(ctx.exception.status_code, 400)

            # Invalid extend days
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_extend_license(self._req({
                    "license_key": self.key, "additional_days": -5
                })))
            self.assertEqual(ctx.exception.status_code, 400)

            # Cannot modify root master account tier
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.admin_upgrade_license(self._req({
                    "license_key": "SCIP-PRO-ROOT-MASTER", "new_tier": "trial"
                })))
            self.assertEqual(ctx.exception.status_code, 400)

    def test_trial_downgrade_and_30_day_renewal(self):
        # Explicit 30 day renewal
        fmt = "%Y-%m-%d %H:%M:%S UTC"
        before_exp = self.manager.get_account(self.key)["expires_at"]
        ok, _, renewed = self.manager.extend_account(self.key, 30)
        self.assertTrue(ok)
        delta = datetime.strptime(renewed["expires_at"], fmt) - datetime.strptime(before_exp, fmt)
        self.assertEqual(delta.days, 30)

        # Trial downgrade resets lifetime expiry to finite trial
        self.manager.get_account(self.key)["expires_at"] = "never"
        ok, _, downgraded = self.manager.upgrade_account(self.key, "trial")
        self.assertTrue(ok)
        self.assertEqual(downgraded["tier"], "trial")
        self.assertNotEqual(downgraded["expires_at"], "never")

    def test_account_and_member_sanitization_no_password_hash(self):
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.root_user):
            # Create account with password
            req = self._req({
                "name": "Dr. Safe",
                "email": "safe@example.test",
                "password": "SecretPassword123!",
                "account_type": "org",
            })
            created = self.async_run(self.web_app.admin_create_license(req))
            self.assertNotIn("password_hash", created)
            self.assertNotIn("password", created)

            # List accounts
            accounts = self.async_run(self.web_app.admin_list_licenses(self._req()))
            for acc in accounts:
                self.assertNotIn("password_hash", acc)
                self.assertNotIn("password", acc)
                for m in acc.get("members", []):
                    self.assertNotIn("password_hash", m)
                    self.assertNotIn("password", m)

            # Org members endpoint
            members_resp = self.async_run(self.web_app.admin_get_org_members(created["license_key"], self._req()))
            for m in members_resp.get("members", []):
                self.assertNotIn("password_hash", m)
                self.assertNotIn("password", m)


if __name__ == "__main__": unittest.main()


