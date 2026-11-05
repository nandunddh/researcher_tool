import ast
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

class RegressionTests(unittest.TestCase):
    def test_authentication(self):
        source = ROOT / "web/license_manager.py"
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
        with tempfile.TemporaryDirectory(dir=ROOT / "tests") as folder:
            import json
            path = Path(folder) / "licenses.json"
            path.write_text(json.dumps({"_metadata": {"root_password": "existing-password"}, "licenses": {}}))
            scope["DEFAULT_ROOT_PASSWORD"] = ""
            manager = scope["LicenseManager"](path)
            self.assertFalse(manager.verify_root_auth("wrong"))
            self.assertTrue(manager.verify_root_auth("existing-password"))
            migrated = json.loads(path.read_text())["_metadata"]
            self.assertNotIn("root_password", migrated)
            self.assertTrue(migrated["root_password_hash"].startswith("pbkdf2_sha256$"))
            self.assertTrue(manager.verify_root_auth("existing-password"))
            self.assertFalse(manager.verify_root_auth("SCIP-PRO-ROOT-MASTER"))
        hashed = scope["hash_password"]("example")
        self.assertTrue(scope["verify_password"]("example", hashed))
        self.assertFalse(scope["verify_password"]("wrong", hashed))

    def test_pipeline_targets_exist(self):
        tree = ast.parse((ROOT / "web/app.py").read_text(encoding="utf-8"))
        targets = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "script_name" for t in node.targets):
                targets.extend(n.value for n in ast.walk(node.value) if isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value.endswith(".py"))
        self.assertGreaterEqual(len(targets), 5)
        for target in targets:
            self.assertTrue((ROOT / "app/main" / target).is_file(), target)
