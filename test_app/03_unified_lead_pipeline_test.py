"""
03_unified_lead_pipeline_test.py
================================
Unified 1-Click Lead Generator for Test App / Trial Edition.
Respects 7-Day Trial Duration and 1,000 Verified Leads/Day Limit.
"""

import sys
from pathlib import Path

# Add root folder to path to reuse core engine
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from trial_manager import trial_engine
import importlib
unified_core = importlib.import_module("03_unified_lead_pipeline")

def request_stop():
    unified_core.request_stop()

def run(keyword="cell biology", target_leads=1000, min_score=50, from_date="2025-01-01", to_date="2026-12-31"):
    status = trial_engine.check_status()
    if not status["active"]:
        print(f"🚨 TRIAL RESTRICTION: {status.get('reason', 'Trial period ended')}")
        return

    rem = status.get("remaining_verified_today", 1000)
    actual_target = min(int(target_leads), rem)
    print(f"[TRIAL] Remaining verified leads quota today: {rem}. Target adjusted to: {actual_target}")

    res = unified_core.run_unified_pipeline(
        keyword=keyword,
        target_leads=actual_target,
        min_score=min_score,
        from_date=from_date,
        to_date=to_date
    )

    collected = res.get("collected_leads", 0)
    if collected > 0:
        trial_engine.record_verified_lead(collected)

    return res

if __name__ == "__main__":
    kw = sys.argv[1] if len(sys.argv) > 1 else "cell biology"
    tgt = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    m_score = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    f_date = sys.argv[4] if len(sys.argv) > 4 else "2025-01-01"
    t_date = sys.argv[5] if len(sys.argv) > 5 else "2026-12-31"

    run(keyword=kw, target_leads=tgt, min_score=m_score, from_date=f_date, to_date=t_date)
