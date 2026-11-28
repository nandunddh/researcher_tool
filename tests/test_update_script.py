"""deploy/update.sh: builds beside the live site, swaps only after a good build, reinstalls packages only when the lock changes.

Runs the script's functions in a temporary folder with a stand-in `npm` that records calls; nothing real is installed or built.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "deploy" / "update.sh"
BASH = shutil.which("bash")

FAKE_NPM = """#!/usr/bin/env bash
echo "$*" >> "$NPM_LOG"
if [ "$1" = "ci" ]; then mkdir -p node_modules && date +%s%N > node_modules/.installed; exit 0; fi
if [ "$1 $2" = "run build" ]; then
  [ "${FAIL_BUILD:-}" = "1" ] && { echo "build broke" >&2; exit 1; }
  mkdir -p "$NEXT_DIST_DIR" && echo "${BUILD_NAME:-build}" > "$NEXT_DIST_DIR/BUILD_ID"; exit 0
fi
"""


@unittest.skipUnless(BASH, "bash is needed to run the deploy script")
class UpdateScriptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.app = self.tmp / "app"
        (self.app / "frontend").mkdir(parents=True)
        self.lock("v1")
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        npm = bin_dir / "npm"
        npm.write_text(FAKE_NPM, newline="\n")
        npm.chmod(0o755)
        self.log = self.tmp / "npm.log"
        self.env = {**os.environ, "APP_DIR": self.app.as_posix(), "NPM_LOG": self.log.as_posix(),
                    "PATH": f"{bin_dir.as_posix()}{os.pathsep}{os.environ.get('PATH', '')}"}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def lock(self, text):
        (self.app / "frontend" / "package-lock.json").write_text(text)

    def deploy(self, **env):
        """Packages, build and swap, as main() does them (pull, pip and restarts are left out)."""
        script = SCRIPT.as_posix()
        return subprocess.run([BASH, "-c", f'source "{script}" && install_packages && build && swap'],
                              env={**self.env, **env}, capture_output=True, text=True)

    def npm_calls(self):
        return self.log.read_text().split("\n")[:-1] if self.log.exists() else []

    def live_build(self):
        return (self.app / "frontend" / ".next" / "BUILD_ID").read_text().strip()

    def test_first_deploy_installs_builds_aside_and_swaps(self):
        result = self.deploy(BUILD_NAME="one")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.npm_calls(), ["ci --no-audit --no-fund", "run build"])
        self.assertEqual(self.live_build(), "one")
        self.assertFalse((self.app / "frontend" / ".next-build").exists())

    def test_packages_are_reinstalled_only_when_the_lock_changes(self):
        self.deploy(BUILD_NAME="one")
        self.deploy(BUILD_NAME="two")
        self.assertEqual(self.npm_calls().count("ci --no-audit --no-fund"), 1, "same lock: node_modules kept")
        self.assertEqual(self.live_build(), "two")
        self.assertEqual((self.app / "frontend" / ".next-old" / "BUILD_ID").read_text().strip(), "one", "previous build kept until checked")
        self.lock("v2")
        self.deploy(BUILD_NAME="three")
        self.assertEqual(self.npm_calls().count("ci --no-audit --no-fund"), 2, "changed lock: reinstalled")

    def test_a_failed_build_leaves_the_live_site_alone(self):
        self.deploy(BUILD_NAME="good")
        result = self.deploy(FAIL_BUILD="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.live_build(), "good")

    def test_the_build_folder_is_passed_to_next(self):
        self.deploy()
        self.assertTrue((self.app / "frontend" / ".next" / "BUILD_ID").exists())
        self.assertIn('NEXT_DIST_DIR=.next-build npm run build', SCRIPT.read_text())


if __name__ == "__main__":
    unittest.main()
