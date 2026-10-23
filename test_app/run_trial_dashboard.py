"""
run_trial_dashboard.py
======================
Launches SciNexus - 7-Day Evaluation Edition for testers.
"""

import sys
import time
import webbrowser
from pathlib import Path
import uvicorn

from trial_manager import trial_engine

if __name__ == "__main__":
    status = trial_engine.check_status()

    print("=" * 65)
    print("🚀 SCINEXUS - ACADEMIC LEAD INTELLIGENCE (EVALUATION EDITION)")
    print("=" * 65)

    if not status["active"]:
        print("\n❌ YOUR 7-DAY EVALUATION TRIAL HAS EXPIRED")
        print(f"Reason: {status.get('reason')}")
        print("\nTo continue using SciNexus with unlimited verifications,")
        print("please contact your sales representative or support team.")
        print("=" * 65 + "\n")
        input("Press Enter to exit...")
        sys.exit(1)

    print(f"Status           : Active Evaluation License")
    print(f"Trial Time Left  : {status['days_left']} Days (Expires: {status['expires_on']})")
    print(f"Today's Quota    : {status['today_verified']} / 1,000 Verified Leads Used")
    print(f"Remaining Today  : {status['remaining_verified_today']} Verified Leads")
    print(f"Candidate Pool   : Up to 10,000 leads per topic")
    print("=" * 65)
    print("👉 Starting SciNexus Dashboard on: http://localhost:8000")
    print("=" * 65 + "\n")

    time.sleep(1.2)
    try:
        webbrowser.open("http://localhost:8000")
    except Exception:
        pass

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False, log_level="warning")
