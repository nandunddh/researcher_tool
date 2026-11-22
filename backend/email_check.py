"""Domain-level delivery checks for public contact addresses."""
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import dns.exception
import dns.resolver


ROLES = frozenset("info admin contact office support sales noreply no-reply webmaster hello team secretary postmaster".split())
DISPOSABLE = frozenset({"mailinator.com", "10minutemail.com", "guerrillamail.com", "guerrillamail.org", "sharklasers.com", "yopmail.com"})
ATOM = r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
LOCAL = re.compile(rf"{ATOM}(?:\.{ATOM})*")
LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
STATUSES = {"invalid_format", "disposable", "no_domain", "no_mail_server", "role", "deliverable_domain", "unknown"}


def load_disposable_domains(path):
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    return DISPOSABLE.union(line.strip().lower() for line in lines if line.strip() and not line.lstrip().startswith("#"))


@lru_cache(maxsize=1)
def default_resolver():
    resolver = dns.resolver.Resolver()
    resolver.cache = dns.resolver.LRUCache(max_size=4096)
    return resolver


def mail_route(domain, resolver):
    try:
        resolver = resolver if resolver is not None else default_resolver()
        try:
            mx = resolver.resolve(domain, "MX", lifetime=3, search=False)
            # A null MX explicitly declines mail, even when a web server exists.
            return "deliverable_domain" if any(str(record.exchange) != "." for record in mx) else "no_mail_server"
        except dns.resolver.NoAnswer:
            resolver.resolve(domain, "A", lifetime=3, search=False)
            return "deliverable_domain"
    except dns.resolver.NXDOMAIN:
        return "no_domain"
    except dns.resolver.NoAnswer:
        return "no_mail_server"
    except (dns.exception.DNSException, OSError):
        return "unknown"


class EmailChecker:
    def __init__(self, resolver=None, disposable_domains=DISPOSABLE):
        self.resolver = resolver
        self.disposable_domains = disposable_domains
        self.routes = {}

    def check(self, email):
        local, _, domain = (email or "").strip().rpartition("@")
        try:
            domain = domain.encode("idna").decode("ascii").lower()
        except UnicodeError:
            domain = ""
        labels = domain.split(".")
        valid = bool(LOCAL.fullmatch(local) and len(local) <= 64 and len(local) + len(domain) + 1 <= 254
                     and len(labels) > 1 and all(LABEL.fullmatch(label) for label in labels)
                     and not labels[-1].isdigit())
        role = valid and local.lower().split("+", 1)[0] in ROLES
        disposable = valid and any(".".join(labels[i:]) in self.disposable_domains for i in range(len(labels)))
        status = "invalid_format"
        if disposable:
            status = "disposable"
        elif valid:
            if domain not in self.routes:
                self.routes[domain] = mail_route(domain, self.resolver)
            status = self.routes[domain]
            if status == "deliverable_domain" and role:
                status = "role"
        return {
            "delivery_status": status,
            "checks": {"format": valid, "role": role, "disposable": disposable,
                       "domain": status in {"deliverable_domain", "role", "no_mail_server"},
                       "mail_server": status in {"deliverable_domain", "role"}},
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }


def check(email: str, resolver=None) -> dict:
    return EmailChecker(resolver).check(email)


def check_batch(emails, resolver=None):
    groups = defaultdict(list)
    for email in emails:
        groups[email.rpartition("@")[2].lower()].append(email)

    def check_group(group):
        checker = EmailChecker(resolver)
        return [(email, checker.check(email)) for email in group]

    with ThreadPoolExecutor(max_workers=6) as pool:
        return dict(pair for group in pool.map(check_group, groups.values()) for pair in group)
