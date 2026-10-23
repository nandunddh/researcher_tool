"""
run_trial_dashboard.py
======================
Launches SciProspect - 7-Day Evaluation Edition as a NATIVE DESKTOP WINDOW
(No browser address bar, no tabs, standalone window).
"""

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

# Safe stream to prevent NoneType isatty crashes in windowed mode
class SafeStream:
    def write(self, s):
        pass
    def flush(self):
        pass
    def isatty(self):
        return False

if sys.stdout is None:
    sys.stdout = SafeStream()
if sys.stderr is None:
    sys.stderr = SafeStream()

import uvicorn
import app as api_module
from trial_manager import trial_engine

APP_URL = "http://127.0.0.1:8000"


def run_server():
    """Runs the FastAPI backend in a background thread."""
    uvicorn.run(
        api_module.app,
        host="127.0.0.1",
        port=8000,
        reload=False,
        log_config=None,
        access_log=False
    )


def open_native_desktop_window():
    """
    Opens SciProspect inside a dedicated, borderless native application window.
    Priority 1: pywebview (true embedded WebView2 native window).
    Priority 2: Microsoft Edge App Mode (--app, borderless standalone window).
    Priority 3: Default system browser fallback.
    """
    # 1. Try PyWebView for a true native app window
    try:
        import webview
        window = webview.create_window(
            title="SciProspect - Scientific Lead Prospecting (Evaluation Edition)",
            url=APP_URL,
            width=1340,
            height=860,
            min_size=(1020, 700),
            confirm_close=False
        )
        webview.start()
        sys.exit(0)
    except Exception:
        pass

    # 2. Fallback to Edge App Mode (Dedicated window with NO URL bar and NO tabs)
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge_exe = next((p for p in edge_paths if os.path.exists(p)), None)
    if edge_exe:
        try:
            # --app creates a standalone application frame with no address bar or tabs
            proc = subprocess.Popen([
                edge_exe,
                f"--app={APP_URL}",
                "--window-size=1340,860",
                "--app-title=SciProspect"
            ])
            proc.wait()
            sys.exit(0)
        except Exception:
            pass

    # 3. Fallback to default browser
    try:
        import webbrowser
        webbrowser.open(APP_URL)
    except Exception:
        pass


if __name__ == "__main__":
    status = trial_engine.check_status()

    if not status["active"]:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                f"Your 7-day evaluation trial has ended.\n\nReason: {status.get('reason')}\n\nPlease contact support to upgrade.",
                "SciProspect Trial Expired",
                0x10  # MB_ICONERROR
            )
        except Exception:
            pass
        sys.exit(1)

    # Start FastAPI backend in background daemon thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait for server to bind port
    time.sleep(1.2)

    # Launch native desktop application window
    open_native_desktop_window()
