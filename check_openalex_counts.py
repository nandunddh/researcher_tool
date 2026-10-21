import os
import requests

SEARCH_TERMS = [
    "machine learning in healthcare",
    "medical image analysis",
    "clinical artificial intelligence",
]

BASE_URL = "https://api.openalex.org/works"
API_KEY = "5h8s0xhGxE1uL0ZJ5CdsT5"

HEADERS = {
    "User-Agent": "CountChecker/1.0 (mailto:researcher_tool@academic.edu)"
}


def get_count(term, filter_str):
    params = {
        "search": term,
        "per-page": 1,
    }
    if API_KEY:
        params["api_key"] = API_KEY
    if filter_str:
        params["filter"] = filter_str

    try:
        res = requests.get(BASE_URL, params=params, headers=HEADERS, timeout=15)
        if res.status_code == 200:
            return res.json().get("meta", {}).get("count", 0)
        else:
            print(f"HTTP {res.status_code} for '{term}': {res.text[:100]}")
    except Exception as e:
        print(f"Error fetching count for '{term}': {e}")
    return 0


def main():
    print("=================================================================")
    print("  OpenAlex Paper Volume Statistics")
    print("=================================================================\n")

    grand_total_2026 = 0
    grand_total_5years = 0

    print(f"{'Search Term':<35} | {'Year 2024':<10} | {'Year 2025':<10} | {'2021-Present':<14} | {'All-Time':<12}")
    print("-" * 92)

    total_2024 = 0
    total_2025 = 0
    total_recent = 0
    total_all = 0

    for term in SEARCH_TERMS:
        c_2024 = get_count(term, "publication_year:2024")
        c_2025 = get_count(term, "publication_year:2025")
        c_recent = get_count(term, "from_publication_date:2021-01-01")
        c_all = get_count(term, None)

        total_2024 += c_2024
        total_2025 += c_2025
        total_recent += c_recent
        total_all += c_all

        print(f"{term:<35} | {c_2024:<10,d} | {c_2025:<10,d} | {c_recent:<14,d} | {c_all:<12,d}")

    print("-" * 92)
    print(f"{'TOTAL ACROSS ALL 3 TERMS':<35} | {total_2024:<10,d} | {total_2025:<10,d} | {total_recent:<14,d} | {total_all:<12,d}")
    print("============================================================================================\n")


if __name__ == "__main__":
    main()
