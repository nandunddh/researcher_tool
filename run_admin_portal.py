"""
run_admin_portal.py
===================
Standalone Launcher for the SciProspect Root Admin Licensing Command Center.
Allows the Root User to immediately open and manage client accounts:
- Issue new 7-day Trial and Pro Lifetime accounts
- Configure daily verified lead quotas
- Exercise instant remote kill-switch (STOP / RESUME)
"""

import os
import socket
import sys
import time
import webbrowser
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def launch_admin_console():
    print("=" * 65)
    print("🛡️  SCIPROSPECT ROOT ADMIN LICENSING COMMAND CENTER")
    print("=" * 65)

    # 1. Check if the primary server on port 8000 is already active
    admin_url = "http://localhost:8000/admin"
    if is_port_in_use(8000):
        print(f"[ROOT] Detected running SciProspect server on port 8000.")
        print(f"[ROOT] Opening Admin Console at: {admin_url}")
        webbrowser.open(admin_url)
        return

    # 2. If not running, start uvicorn directly
    print("[ROOT] Starting dedicated Admin Server on port 8000...")
    try:
        import uvicorn
        webbrowser.open(admin_url)
        uvicorn.run("app:app", host="127.0.0.1", port=8000, log_level="info")
    except Exception as e:
        print(f"[ERROR] Failed to launch server: {e}")
        input("Press Enter to exit...")


if __name__ == "__main__":
    launch_admin_console()
