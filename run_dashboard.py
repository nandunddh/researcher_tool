"""
run_dashboard.py
================
Launches the Researcher Tool Web Application & Dashboard on http://localhost:8000
"""

import os
import sys
import webbrowser
from pathlib import Path

import uvicorn

BASE_DIR = Path(__file__).resolve().parent

if __name__ == "__main__":
    port = 8000
    url = f"http://localhost:{port}"

    print("=" * 70)
    print("🚀 RESEARCHER TOOL - ACADEMIC OUTREACH WEB DASHBOARD")
    print(f"👉 Local Access: {url}")
    print("=" * 70)

    # Open browser automatically
    try:
        webbrowser.open(url)
    except Exception:
        pass

    uvicorn.run("app:app", host="127.0.0.1", port=port, reload=True, app_dir=str(BASE_DIR))
