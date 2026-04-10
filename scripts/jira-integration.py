#!/usr/bin/env python3
"""
jira-integration.py — Jira integration for ForgeOps CI/CD pipelines.

Uses only urllib (no third-party dependencies). Gracefully skips when
--url is empty or not provided.

Subcommands:
  create-ticket   — Create a new Jira issue
  transition      — Extract ticket IDs ([A-Z]+-\\d+) from git log and transition them
  update-status   — Transition a specific ticket by transition name
  set-fix-version — Set the fix version on a ticket
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request


# ─── Helpers ──────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(f"[jira-integration] {msg}", file=sys.stderr)


def skip(reason: str) -> None:
    log(f"Skipping: {reason}")
    sys.exit(0)


def jira_request(base_url: str, token: str, method: str, path: str,
                 data: dict | None = None) -> dict | None:
    """Make an authenticated Jira REST API request."""
    url = f"{base_url.rstrip('/')}/rest/api/2/{path.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        log(f"HTTP {exc.code} from Jira: {error_body}")
        sys.exit(1)
    except urllib.error.URLError as exc:
        log(f"Connection error: {exc.reason}")
        sys.exit(1)


def require_config(url: str, token: str) -> None:
    """Exit gracefully if Jira is not configured."""
    if not url:
        skip("Jira URL is empty or not provided")
    if not token:
        skip("JIRA_TOKEN is not set")


# ─── Subcommands ──────────────────────────────────────────────────────────────

def cmd_create_ticket(args: argparse.Namespace) -> None:
    """Create a new Jira issue."""
    require_config(args.url, args.token)

    payload = {
        "fields": {
            "project": {"key": args.project},
            "summary": args.summary,
            "issuetype": {"name": args.issue_type},
        }
    }
    if args.description:
        payload["fields"]["description"] = args.description
    if args.labels:
        payload["fields"]["labels"] = args.labels.split(",")
    if args.priority:
        payload["fields"]["priority"] = {"name": args.priority}

    result = jira_request(args.url, args.token, "POST", "issue", payload)
    if result:
        key = result.get("key", "unknown")
        log(f"Created ticket: {key}")
        print(key)


def cmd_transition(args: argparse.Namespace) -> None:
    """Extract ticket IDs from git log and transition them."""
    require_config(args.url, args.token)

    # Get git log
    try:
        git_log = subprocess.check_output(
            ["git", "log", f"-{args.commits}", "--pretty=format:%s"],
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        log("Failed to read git log")
        sys.exit(1)

    # Extract ticket IDs
    ticket_ids = set(re.findall(r"[A-Z]+-\d+", git_log))
    if not ticket_ids:
        log("No Jira ticket IDs found in recent git log")
        return

    log(f"Found tickets: {', '.join(sorted(ticket_ids))}")

    for ticket_id in sorted(ticket_ids):
        _transition_ticket(args.url, args.token, ticket_id, args.transition_name)


def cmd_update_status(args: argparse.Namespace) -> None:
    """Transition a specific ticket by transition name."""
    require_config(args.url, args.token)
    _transition_ticket(args.url, args.token, args.ticket, args.transition_name)


def _transition_ticket(base_url: str, token: str, ticket_id: str,
                       transition_name: str) -> None:
    """Find and execute a transition by name on a ticket."""
    # Get available transitions
    result = jira_request(base_url, token, "GET",
                          f"issue/{ticket_id}/transitions")
    if not result:
        log(f"No transitions returned for {ticket_id}")
        return

    transitions = result.get("transitions", [])
    target = None
    for t in transitions:
        if t["name"].lower() == transition_name.lower():
            target = t
            break

    if not target:
        available = ", ".join(t["name"] for t in transitions)
        log(f"Transition '{transition_name}' not found for {ticket_id}. "
            f"Available: {available}")
        return

    payload = {"transition": {"id": target["id"]}}
    jira_request(base_url, token, "POST",
                 f"issue/{ticket_id}/transitions", payload)
    log(f"Transitioned {ticket_id} -> '{transition_name}'")


def cmd_set_fix_version(args: argparse.Namespace) -> None:
    """Set the fix version on a ticket."""
    require_config(args.url, args.token)

    payload = {
        "update": {
            "fixVersions": [{"add": {"name": args.version}}]
        }
    }
    jira_request(args.url, args.token, "PUT",
                 f"issue/{args.ticket}", payload)
    log(f"Set fix version '{args.version}' on {args.ticket}")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="ForgeOps Jira integration (stdlib-only)")
    parser.add_argument("--url", default=os.environ.get("JIRA_URL", ""),
                        help="Jira base URL (or set JIRA_URL env var)")
    parser.add_argument("--token", default=os.environ.get("JIRA_TOKEN", ""),
                        help="Jira API token (or set JIRA_TOKEN env var)")

    sub = parser.add_subparsers(dest="command", required=True)

    # create-ticket
    ct = sub.add_parser("create-ticket", help="Create a new Jira issue")
    ct.add_argument("--project", required=True, help="Project key (e.g. FORGE)")
    ct.add_argument("--summary", required=True, help="Issue summary/title")
    ct.add_argument("--issue-type", default="Task", help="Issue type name")
    ct.add_argument("--description", default="", help="Issue description")
    ct.add_argument("--labels", default="", help="Comma-separated labels")
    ct.add_argument("--priority", default="", help="Priority name")
    ct.set_defaults(func=cmd_create_ticket)

    # transition
    tr = sub.add_parser("transition",
                        help="Extract tickets from git log and transition")
    tr.add_argument("--transition-name", required=True,
                    help="Target transition name (e.g. 'In Progress')")
    tr.add_argument("--commits", type=int, default=10,
                    help="Number of recent commits to scan")
    tr.set_defaults(func=cmd_transition)

    # update-status
    us = sub.add_parser("update-status",
                        help="Transition a specific ticket by name")
    us.add_argument("--ticket", required=True, help="Ticket ID (e.g. FORGE-123)")
    us.add_argument("--transition-name", required=True,
                    help="Target transition name")
    us.set_defaults(func=cmd_update_status)

    # set-fix-version
    fv = sub.add_parser("set-fix-version",
                        help="Set fix version on a ticket")
    fv.add_argument("--ticket", required=True, help="Ticket ID")
    fv.add_argument("--version", required=True, help="Version name")
    fv.set_defaults(func=cmd_set_fix_version)

    args = parser.parse_args()

    # Graceful skip when URL is empty
    if not args.url:
        skip("--url is empty and JIRA_URL is not set")

    args.func(args)


if __name__ == "__main__":
    main()
