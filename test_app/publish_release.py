"""
publish_release.py
==================
Publishes GitHub Release v1.0.1 and attaches SciProspect_Setup.exe.
"""

import subprocess
import requests
import json
import os
import sys
from pathlib import Path

def main():
    # 1. Retrieve GitHub Token from Git Credential Manager
    print("[Step 1/3] Reading Git authentication token...")
    res = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n",
        capture_output=True,
        text=True
    )
    lines = dict(line.split("=", 1) for line in res.stdout.splitlines() if "=" in line)
    token = lines.get("password")
    if not token:
        print("[ERROR] Could not find GitHub token in Git Credential Manager.")
        sys.exit(1)

    repo = "nandunddh/researcher_tool"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "SciProspect-Release-Publisher/1.0"
    }

    # 2. Check if release already exists or create new one
    tag = "v1.0.1"
    print(f"[Step 2/3] Checking GitHub Release for tag '{tag}'...")
    release_url = f"https://api.github.com/repos/{repo}/releases"
    r = requests.get(f"{release_url}/tags/{tag}", headers=headers)
    
    if r.status_code == 200:
        release = r.json()
        print(f"Found existing release id: {release['id']}")
    else:
        body_text = (
            "## SciProspect v1.0.1 (Evaluation Edition)\n\n"
            "### What's New in this release:\n"
            "- **Native Full-Width Desktop Menu Bar**: Moved File, Pipeline, Data & Tools, Help to edge-to-edge titlebar\n"
            "- **Fixed Email Copy Alignment**: Emails and copy icon never wrap or break onto separate lines\n"
            "- **Instant Green Checkmark Feedback**: Visual animation confirms copy-to-clipboard action\n"
            "- **Rich Scientific Profile Dossier**: Categorized modal with initials avatar, ORCID link, and publications\n"
            "- **Full-Width Footer Status Bar**: Displays exact app version and configured lead data folder\n"
            "- **Integrated 1-Click Auto-Updater**: Automated GitHub download and upgrade flow\n"
        )
        create_payload = {
            "tag_name": tag,
            "target_commitish": "main",
            "name": "SciProspect v1.0.1 - Desktop Navigation & Auto-Update",
            "body": body_text,
            "draft": False,
            "prerelease": False
        }
        r = requests.post(release_url, headers=headers, json=create_payload)
        if r.status_code not in [200, 201]:
            print(f"[ERROR] Failed to create release: {r.status_code}\n{r.text}")
            sys.exit(1)
        release = r.json()
        print(f"Successfully created release id: {release['id']}")

    # 3. Locate installer file
    asset_file = Path("dist_installer/SciProspect_Setup.exe")
    if not asset_file.exists():
        # Fallback to test_app/dist_installer
        asset_file = Path("test_app/dist_installer/SciProspect_Setup.exe")
    if not asset_file.exists():
        print(f"[ERROR] Could not find installer binary at: {asset_file}")
        sys.exit(1)

    # Delete existing asset with same name if any
    for a in release.get("assets", []):
        if a.get("name") == "SciProspect_Setup.exe":
            asset_id = a["id"]
            print(f"Removing old release asset id {asset_id}...")
            requests.delete(f"https://api.github.com/repos/{repo}/releases/assets/{asset_id}", headers=headers)

    # Upload binary asset
    upload_url_template = release["upload_url"]
    upload_url = upload_url_template.split("{")[0]
    upload_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream",
        "User-Agent": "SciProspect-Release-Publisher/1.0"
    }

    file_size_kb = round(asset_file.stat().st_size / 1024, 1)
    print(f"[Step 3/3] Uploading {asset_file.name} ({file_size_kb} KB) to GitHub Release...")
    with open(asset_file, "rb") as f:
        up_res = requests.post(
            f"{upload_url}?name=SciProspect_Setup.exe",
            headers=upload_headers,
            data=f
        )

    if up_res.status_code in [200, 201]:
        asset_data = up_res.json()
        download_url = asset_data.get("browser_download_url")
        print("\n" + "=" * 65)
        print("🎉 SUCCESS! SciProspect v1.0.1 is LIVE on GitHub Releases!")
        print(f"Download URL: {download_url}")
        print("=" * 65 + "\n")
    else:
        print(f"[ERROR] Upload failed with status {up_res.status_code}:\n{up_res.text}")
        sys.exit(1)

if __name__ == "__main__":
    main()
