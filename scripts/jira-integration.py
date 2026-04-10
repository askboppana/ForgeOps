#!/usr/bin/env python3
"""
jira-integration.py — Jira integration for ForgeOps pipelines.

Subcommands:
  create-ticket  Create a Jira issue
  transition     Transition issues found in git commit messages
  set-fix-version  Set fix version on issues found in git commits

Uses only urllib (no pip dependencies).
"""

import argparse
import json
import re
import subprocess
import sys
import urllib.request
import urllib.error


def jira_request(url, token, path, method="GET", data=None):
    """Make an authenticated request to the Jira REST API."""
    full_url = f"{url.rstrip('/')}/rest/api/2/{path.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(full_url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 204:
                return {}
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"Jira API error ({e.code}): {error_body}", file=sys.stderr)
        sys.exit(1)


def extract_jira_keys(commit_range):
    """Extract Jira issue keys (e.g. PROJ-123) from git log messages."""
    try:
        result = subprocess.run(
            ["git", "log", "--pretty=format:%s %b", commit_range],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError:
        # Fallback: try last commit only
        result = subprocess.run(
            ["git", "log", "-1", "--pretty=format:%s %b"],
            capture_output=True, text=True, check=True,
        )

    messages = result.stdout
    keys = re.findall(r"[A-Z]+-\d+", messages)
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for k in keys:
        if k not in seen:
            seen.add(k)
            unique.append(k)
    return unique


# ── Subcommand: create-ticket ──

def cmd_create_ticket(args):
    """Create a new Jira issue."""
    fields = {
        "project": {"key": args.project},
        "issuetype": {"name": args.type},
        "summary": args.summary,
        "description": args.description,
        "priority": {"name": args.priority},
    }

    if args.labels:
        fields["labels"] = [l.strip() for l in args.labels.split(",")]

    data = {"fields": fields}
    result = jira_request(args.url, args.token, "issue", method="POST", data=data)
    issue_key = result.get("key", "UNKNOWN")
    print(f"Created Jira ticket: {issue_key}")
    return issue_key


# ── Subcommand: transition ──

def cmd_transition(args):
    """Transition Jira issues found in git commit messages."""
    keys = extract_jira_keys(args.commit_range)

    if not keys:
        print("No Jira issue keys found in commit messages.")
        return

    print(f"Found Jira keys: {', '.join(keys)}")

    for key in keys:
        # Get available transitions
        transitions = jira_request(args.url, args.token, f"issue/{key}/transitions")
        available = transitions.get("transitions", [])

        # Find matching transition
        target = None
        for t in available:
            if t["name"].lower() == args.status.lower():
                target = t
                break

        if target:
            transition_data = {"transition": {"id": target["id"]}}
            jira_request(
                args.url, args.token,
                f"issue/{key}/transitions",
                method="POST", data=transition_data,
            )
            print(f"  {key}: transitioned to '{args.status}'")
        else:
            available_names = [t["name"] for t in available]
            print(f"  {key}: transition '{args.status}' not available (available: {available_names})")

        # Add comment if provided
        if args.comment:
            comment_data = {"body": args.comment}
            jira_request(
                args.url, args.token,
                f"issue/{key}/comment",
                method="POST", data=comment_data,
            )
            print(f"  {key}: comment added")


# ── Subcommand: set-fix-version ──

def cmd_set_fix_version(args):
    """Set fix version on Jira issues found in git commits."""
    keys = extract_jira_keys(args.commit_range)

    if not keys:
        print("No Jira issue keys found in commit messages.")
        return

    print(f"Setting fix version '{args.version}' on: {', '.join(keys)}")

    # Ensure version exists (create if not)
    # Extract project key from first issue
    project_key = keys[0].split("-")[0]
    try:
        jira_request(
            args.url, args.token,
            f"project/{project_key}/versions",
        )
    except SystemExit:
        pass

    # Try to create the version (ignore if exists)
    version_data = {
        "name": args.version,
        "project": project_key,
        "released": False,
    }
    try:
        jira_request(
            args.url, args.token,
            "version",
            method="POST", data=version_data,
        )
        print(f"  Created version '{args.version}'")
    except SystemExit:
        print(f"  Version '{args.version}' already exists or could not be created")

    # Update each issue
    for key in keys:
        update_data = {
            "update": {
                "fixVersions": [{"add": {"name": args.version}}]
            }
        }
        try:
            jira_request(
                args.url, args.token,
                f"issue/{key}",
                method="PUT", data=update_data,
            )
            print(f"  {key}: fix version set to '{args.version}'")
        except SystemExit:
            print(f"  {key}: failed to set fix version")


# ── CLI ──

def main():
    parser = argparse.ArgumentParser(description="ForgeOps Jira Integration")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create-ticket
    ct = subparsers.add_parser("create-ticket", help="Create a Jira ticket")
    ct.add_argument("--url", required=True, help="Jira base URL")
    ct.add_argument("--token", required=True, help="Jira API token")
    ct.add_argument("--project", required=True, help="Jira project key")
    ct.add_argument("--type", required=True, help="Issue type (Bug, Task, Story)")
    ct.add_argument("--summary", required=True, help="Issue summary")
    ct.add_argument("--description", required=True, help="Issue description")
    ct.add_argument("--priority", default="Medium", help="Priority (Critical, High, Medium, Low)")
    ct.add_argument("--labels", default="", help="Comma-separated labels")

    # transition
    tr = subparsers.add_parser("transition", help="Transition issues from git commits")
    tr.add_argument("--url", required=True, help="Jira base URL")
    tr.add_argument("--token", required=True, help="Jira API token")
    tr.add_argument("--commit-range", required=True, help="Git commit range (e.g. HEAD~5..HEAD)")
    tr.add_argument("--status", required=True, help="Target transition name")
    tr.add_argument("--comment", default="", help="Comment to add to each issue")

    # set-fix-version
    fv = subparsers.add_parser("set-fix-version", help="Set fix version on issues from git commits")
    fv.add_argument("--url", required=True, help="Jira base URL")
    fv.add_argument("--token", required=True, help="Jira API token")
    fv.add_argument("--commit-range", required=True, help="Git commit range")
    fv.add_argument("--version", required=True, help="Fix version name")

    args = parser.parse_args()

    if args.command == "create-ticket":
        cmd_create_ticket(args)
    elif args.command == "transition":
        cmd_transition(args)
    elif args.command == "set-fix-version":
        cmd_set_fix_version(args)


if __name__ == "__main__":
    main()
