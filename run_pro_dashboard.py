"""
run_pro_dashboard.py
====================
Launches SciProspect Professional (Lifetime Unlimited Edition)
as a native desktop application window with zero limits.
"""

import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

# Safe stream to prevent NoneType crashes in windowed mode
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

import socket
import uvicorn
import app as api_module

def find_available_port(preferred_port=8000):
    for p in [preferred_port, 8002, 8003, 8004]:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", p))
                return p
        except Exception:
            continue
    return preferred_port

APP_PORT = find_available_port(8000)
APP_URL = f"http://127.0.0.1:{APP_PORT}"
BASE_DIR = Path(__file__).resolve().parent


def run_server():
    """Runs FastAPI backend in a background thread."""
    uvicorn.run(
        api_module.app,
        host="127.0.0.1",
        port=APP_PORT,
        reload=False,
        log_config=None,
        access_log=False
    )


def open_native_desktop_window():
    """
    Opens SciProspect inside a dedicated native window frame:
    1. PyWebView (Native WebView2 Window)
    2. Microsoft Edge App Mode (--app, borderless standalone desktop window)
    3. Default system web browser fallback
    """
    # 1. Try PyWebView
    try:
        import webview
        window = webview.create_window(
            title="SciProspect Professional (Lifetime Commercial Edition)",
            url=APP_URL,
            width=1360,
            height=880,
            min_size=(1020, 700),
            confirm_close=False
        )
        webview.start()
        sys.exit(0)
    except Exception:
        pass

    # 2. Try Edge App Mode (Dedicated standalone window with no browser tabs/URL bar)
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge_exe = next((p for p in edge_paths if os.path.exists(p)), None)
    if edge_exe:
        try:
            proc = subprocess.Popen([
                edge_exe,
                f"--app={APP_URL}",
                "--window-size=1360,880",
                "--app-title=SciProspect Professional"
            ])
            proc.wait()
            sys.exit(0)
        except Exception:
            pass

    # 3. Fallback to default browser
    try:
        webbrowser.open(APP_URL)
    except Exception:
        pass


if __name__ == "__main__":
    print("=" * 70)
    print("🚀 SCIPROSPECT PROFESSIONAL - LIFETIME UNLIMITED EDITION")
    print(f"👉 Local Access: {APP_URL}")
    print("=" * 70)

    # Start backend server
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait for server port bind
    time.sleep(1.2)

    # Open standalone desktop window
    open_native_desktop_window()
