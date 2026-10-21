import csv
import re
import socket
import sys
import time
from pathlib import Path

FOLDER = Path(__file__).parent
DEFAULT_FILE = FOLDER / "researchers_with_emails.csv"

EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

# Cache domain verification results so we don't repeatedly check the same university
DOMAIN_CACHE = {}


def verify_domain_mx(domain):
    """Check if the email domain resolves to a valid internet host with active mail infrastructure."""
    domain = domain.strip().lower()
    if not domain or "." not in domain:
        return False, "Invalid Domain Format"

    if domain in DOMAIN_CACHE:
        return DOMAIN_CACHE[domain]

    try:
        # Check if the host/domain exists in DNS
        host_info = socket.gethostbyname_ex(domain)
        # host_info returns (hostname, aliaslist, ipaddrlist)
        if host_info and host_info[2]:
            result = (True, f"Active Host ({host_info[0]})")
        else:
            result = (False, "No Host IP Found")
    except socket.gaierror:
        result = (False, "Domain DNS Not Found (Bounces)")
    except Exception as e:
        result = (False, f"DNS Error ({str(e)[:30]})")

    DOMAIN_CACHE[domain] = result
    return result


def verify_single_email(email_str):
    """Verify email syntax and domain active mail server status."""
    if not email_str:
        return "No Email", ""

    # In case multiple emails are separated by semicolons, check the first
    first_email = email_str.split(";")[0].strip().lower()

    if not EMAIL_RE.fullmatch(first_email):
        return "Invalid Syntax", ""

    domain = first_email.split("@")[-1]
    is_valid, reason = verify_domain_mx(domain)

    if is_valid:
        return "Valid / Active Mail Server", reason
    else:
        return "Dead Domain / Bounces", reason


def process_csv(csv_path):
    target = Path(csv_path)
    if not target.exists():
        print(f"Error: Target file not found: {target}")
        return

    print("=========================================================")
    print(f"  Verifying Email Deliverability for: {target.name}")
    print("=========================================================\n")

    with target.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    if "deliverability_status" not in fieldnames:
        fieldnames.append("deliverability_status")
    if "mail_server_info" not in fieldnames:
        fieldnames.append("mail_server_info")

    total = len(rows)
    verified_valid = 0
    bouncing_count = 0
    no_email_count = 0

    start_time = time.time()

    for i, row in enumerate(rows, 1):
        email = str(row.get("professional_email", "") or "").strip()
        if not email or email.lower() in {"nan", "none", "null"}:
            row["deliverability_status"] = "No Email"
            row["mail_server_info"] = ""
            no_email_count += 1
            continue

        status, info = verify_single_email(email)
        row["deliverability_status"] = status
        row["mail_server_info"] = info

        if "Valid" in status:
            verified_valid += 1
        elif "Dead" in status or "Bounces" in status:
            bouncing_count += 1

        if i % 250 == 0 or i == total:
            print(f"Processed {i}/{total} ({i/total*100:.1f}%) | Active Valid: {verified_valid} | Dead/Bounce: {bouncing_count}")

    # Save verified results back to the CSV
    with target.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    elapsed = time.time() - start_time
    emails_checked = verified_valid + bouncing_count

    print("\n=========================================================")
    print(f"Verification Completed in {elapsed:.2f}s!")
    print(f"Total rows inspected: {total}")
    print(f"Emails checked: {emails_checked}")
    print(f"Verified Active & Deliverable: {verified_valid} ({verified_valid/max(emails_checked, 1)*100:.1f}%)")
    print(f"Dead / Bouncing Domains Flagged: {bouncing_count}")
    print(f"Updated File: {target}")
    print("=========================================================\n")


if __name__ == "__main__":
    file_to_check = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FILE
    process_csv(file_to_check)
