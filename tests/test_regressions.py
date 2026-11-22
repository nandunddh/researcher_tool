import sys
import ast
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))  # license_manager imports stores/db from here

class RegressionTests(unittest.TestCase):
    def test_authentication(self):
        source = ROOT / "backend/license_manager.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        tree.body = [node for node in tree.body if not (isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "license_engine" for t in node.targets))]
        scope = {"__file__": str(source)}
        with patch.dict(os.environ, {"SCIPROSPECT_ROOT_PASS": "test-secret", "SCIPROSPECT_DB_HOST": ""}):
            exec(compile(tree, str(source), "exec"), scope)
        with tempfile.TemporaryDirectory(dir=ROOT / "tests") as folder:
            manager = scope["LicenseManager"](Path(folder) / "licenses.json")
            self.assertTrue(manager.verify_root_auth("test-secret"))
            for bad in ("", "admin2026", "SCIP-PRO-ROOT-MASTER"):
                self.assertFalse(manager.verify_root_auth(bad))
            self.assertTrue(manager.update_root_password("test-secret", "replacement-secret")[0])
            self.assertFalse(manager.verify_root_auth("test-secret"))
            self.assertTrue(manager.verify_root_auth("replacement-secret"))
        # An older install's plain-text root password is accepted once and replaced by a hash.
        from stores import MemoryAccountStore, MemorySessionStore
        accounts = MemoryAccountStore("legacy-root-test")
        accounts.save({"_metadata": {"root_password": "existing-password"}, "licenses": {"SCIP-PRO-ROOT-MASTER": {"license_key": "SCIP-PRO-ROOT-MASTER"}}})
        scope["DEFAULT_ROOT_PASSWORD"] = ""
        manager = scope["LicenseManager"](account_store=accounts, session_store=MemorySessionStore("legacy-root-test"))
        self.assertFalse(manager.verify_root_auth("wrong"))
        self.assertTrue(manager.verify_root_auth("existing-password"))
        migrated = accounts.load()["_metadata"]
        self.assertNotIn("root_password", migrated)
        self.assertTrue(migrated["root_password_hash"].startswith("pbkdf2_sha256$"))
        self.assertTrue(manager.verify_root_auth("existing-password"))
        self.assertFalse(manager.verify_root_auth("SCIP-PRO-ROOT-MASTER"))
        hashed = scope["hash_password"]("example")
        self.assertTrue(scope["verify_password"]("example", hashed))
        self.assertFalse(scope["verify_password"]("wrong", hashed))

