# SciNexus — 7-Day Evaluation Edition

This package allows you to generate a single **`SciNexus_Setup.exe`** that clients can double-click, choose their installation folder, and automatically receive a Desktop shortcut icon.

---

## 🔒 Evaluation Quotas & Safeguards

| Feature | Quota | Behavior when Reached |
| :--- | :--- | :--- |
| **Trial Duration** | **7 Days** | Full app lock after 7 days from first run. |
| **Tool 01 (Candidate Discovery)** | **5,000 – 10,000 leads** | Generates a 5k–10k candidate talent pool from OpenAlex. |
| **Tool 02 (Scholarly Verification)** | **1,000 verified emails / day** | Automatically pauses and saves when 1,000 verified leads for today is reached. Resets next day at 00:00 UTC. |
| **Anti-Tamper Protection** | Active | Validates real network UTC date against rollback of the system clock. |

---

## 🚀 How to Build the Single `Setup.exe` Installer

1. Make sure [Inno Setup (Free)](https://jrsoftware.org/isdl.php) is installed on your computer.
2. Double-click **`build_setup.bat`**.
3. It will automatically:
   * Compile the Python code and static assets using PyInstaller into `dist\SciNexus\`.
   * Run Inno Setup to generate `dist_installer\SciNexus_Setup.exe`.

---

## 💻 What Your Client / Tester Experiences

1. You send them `SciNexus_Setup.exe`.
2. They double-click it.
3. A Windows setup wizard appears asking:
   * **"Where do you want to install SciNexus?" [Browse...]**
   * **"Create a Desktop Shortcut [✓]"**
4. They click **Install** ➔ **Finish**.
5. It places a **"SciNexus"** icon on their desktop and opens the dashboard immediately at `http://localhost:8000`.
6. From then on, they simply click their desktop icon whenever they want to launch SciNexus.
