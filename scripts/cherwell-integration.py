#!/usr/bin/env python3
"""
cherwell-integration.py — ITSM integration for ForgeOps CI/CD pipelines.

Auto-detects Cherwell (OAuth2) or ServiceNow (Basic auth) from environment
variables. Gracefully skips if neither is configured.

Uses only urllib (no third-party dependencies).

Subcommands:
  create-cr  — Create a change request
  update-cr  — Update an existing change request
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


# ─── Helpers ──────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(f"[cherwell-integration] {msg}", file=sys.stderr)


def skip(reason: str) -> None:
    log(f"Skipping: {reason}")
    sys.exit(0)


# ─── Platform detection ──────────────────────────────────────────────────────

class ITSMPlatform:
    """Base class for ITSM platform adapters."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def request(self, method: str, path: str, data: dict | None = None,
                headers: dict | None = None) -> dict | None:
        url = f"{self.base_url}/{path.lstrip('/')}"
        hdrs = {"Content-Type": "application/json", "Accept": "application/json"}
        if headers:
            hdrs.update(headers)
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            log(f"HTTP {exc.code}: {error_body}")
            sys.exit(1)
        except urllib.error.URLError as exc:
            log(f"Connection error: {exc.reason}")
            sys.exit(1)

    def create_cr(self, args: argparse.Namespace) -> None:
        raise NotImplementedError

    def update_cr(self, args: argparse.Namespace) -> None:
        raise NotImplementedError


class CherwellPlatform(ITSMPlatform):
    """Cherwell ITSM using OAuth2 client credentials."""

    def __init__(self, base_url: str, client_id: str, client_secret: str,
                 username: str, password: str):
        super().__init__(base_url)
        self.client_id = client_id
        self.client_secret = client_secret
        self.username = username
        self.password = password
        self._token: str | None = None

    def _authenticate(self) -> str:
        """Obtain an OAuth2 access token."""
        if self._token:
            return self._token

        token_url = f"{self.base_url}/CherwellAPI/token"
        body = urllib.parse.urlencode({
            "grant_type": "password",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "username": self.username,
            "password": self.password,
        }).encode("utf-8")

        req = urllib.request.Request(token_url, data=body, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        req.add_header("Accept", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
                self._token = result["access_token"]
                log("Cherwell OAuth2 authentication successful")
                return self._token
        except (urllib.error.HTTPError, urllib.error.URLError, KeyError) as exc:
            log(f"Cherwell authentication failed: {exc}")
            sys.exit(1)

    def _auth_headers(self) -> dict:
        token = self._authenticate()
        return {"Authorization": f"Bearer {token}"}

    def create_cr(self, args: argparse.Namespace) -> None:
        payload = {
            "busObId": args.bus_ob_id,
            "fields": [
                {"name": "ShortDescription", "value": args.summary, "dirty": True},
                {"name": "Description", "value": args.description or "", "dirty": True},
                {"name": "Priority", "value": args.priority or "3", "dirty": True},
                {"name": "ChangeType", "value": args.change_type or "Normal", "dirty": True},
            ],
        }
        result = self.request("POST", "CherwellAPI/api/V1/savebusinessobject",
                              data=payload, headers=self._auth_headers())
        if result:
            rec_id = result.get("busObRecId", "unknown")
            pub_id = result.get("busObPublicId", "unknown")
            log(f"Created Cherwell CR: {pub_id} (recId={rec_id})")
            print(pub_id)

    def update_cr(self, args: argparse.Namespace) -> None:
        fields = []
        if args.status:
            fields.append({"name": "Status", "value": args.status, "dirty": True})
        if args.comment:
            fields.append({"name": "CloseDescription", "value": args.comment, "dirty": True})

        if not fields:
            log("No fields to update")
            return

        payload = {
            "busObId": args.bus_ob_id,
            "busObPublicId": args.cr_id,
            "fields": fields,
        }
        result = self.request("POST", "CherwellAPI/api/V1/savebusinessobject",
                              data=payload, headers=self._auth_headers())
        if result:
            log(f"Updated Cherwell CR: {args.cr_id}")


class ServiceNowPlatform(ITSMPlatform):
    """ServiceNow ITSM using Basic auth."""

    def __init__(self, base_url: str, username: str, password: str):
        super().__init__(base_url)
        creds = base64.b64encode(f"{username}:{password}".encode()).decode()
        self._auth_header = {"Authorization": f"Basic {creds}"}

    def create_cr(self, args: argparse.Namespace) -> None:
        payload = {
            "short_description": args.summary,
            "description": args.description or "",
            "priority": args.priority or "3",
            "type": args.change_type or "Normal",
            "category": "Software",
        }
        result = self.request("POST", "api/now/table/change_request",
                              data=payload, headers=self._auth_header)
        if result and "result" in result:
            number = result["result"].get("number", "unknown")
            sys_id = result["result"].get("sys_id", "unknown")
            log(f"Created ServiceNow CR: {number} (sys_id={sys_id})")
            print(number)

    def update_cr(self, args: argparse.Namespace) -> None:
        # Lookup sys_id by number
        query = urllib.parse.quote(f"number={args.cr_id}")
        lookup = self.request("GET",
                              f"api/now/table/change_request?sysparm_query={query}&sysparm_limit=1",
                              headers=self._auth_header)
        if not lookup or not lookup.get("result"):
            log(f"CR {args.cr_id} not found in ServiceNow")
            sys.exit(1)

        sys_id = lookup["result"][0]["sys_id"]
        payload = {}
        if args.status:
            payload["state"] = args.status
        if args.comment:
            payload["close_notes"] = args.comment

        if not payload:
            log("No fields to update")
            return

        self.request("PATCH", f"api/now/table/change_request/{sys_id}",
                     data=payload, headers=self._auth_header)
        log(f"Updated ServiceNow CR: {args.cr_id}")


def detect_platform() -> ITSMPlatform:
    """Auto-detect ITSM platform from environment variables."""
    # Check Cherwell first
    cherwell_url = os.environ.get("CHERWELL_URL", "")
    if cherwell_url:
        client_id = os.environ.get("CHERWELL_CLIENT_ID", "")
        client_secret = os.environ.get("CHERWELL_CLIENT_SECRET", "")
        username = os.environ.get("CHERWELL_USERNAME", "")
        password = os.environ.get("CHERWELL_PASSWORD", "")
        if not all([client_id, client_secret, username, password]):
            log("CHERWELL_URL is set but credentials are incomplete")
            log("Required: CHERWELL_CLIENT_ID, CHERWELL_CLIENT_SECRET, "
                "CHERWELL_USERNAME, CHERWELL_PASSWORD")
            sys.exit(1)
        log(f"Detected Cherwell ITSM at {cherwell_url}")
        return CherwellPlatform(cherwell_url, client_id, client_secret,
                                username, password)

    # Check ServiceNow
    snow_url = os.environ.get("SERVICENOW_URL", "")
    if snow_url:
        username = os.environ.get("SERVICENOW_USERNAME", "")
        password = os.environ.get("SERVICENOW_PASSWORD", "")
        if not all([username, password]):
            log("SERVICENOW_URL is set but credentials are incomplete")
            log("Required: SERVICENOW_USERNAME, SERVICENOW_PASSWORD")
            sys.exit(1)
        log(f"Detected ServiceNow ITSM at {snow_url}")
        return ServiceNowPlatform(snow_url, username, password)

    # Neither configured
    skip("Neither CHERWELL_URL nor SERVICENOW_URL is set — ITSM integration disabled")
    sys.exit(0)  # unreachable, keeps type checker happy


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="ForgeOps ITSM integration (Cherwell / ServiceNow)")

    sub = parser.add_subparsers(dest="command", required=True)

    # create-cr
    cc = sub.add_parser("create-cr", help="Create a change request")
    cc.add_argument("--summary", required=True, help="CR summary/title")
    cc.add_argument("--description", default="", help="CR description")
    cc.add_argument("--priority", default="3", help="Priority (1-5)")
    cc.add_argument("--change-type", default="Normal",
                    help="Change type (Normal, Standard, Emergency)")
    cc.add_argument("--bus-ob-id", default="",
                    help="Cherwell Business Object ID (Cherwell only)")

    # update-cr
    uc = sub.add_parser("update-cr", help="Update a change request")
    uc.add_argument("--cr-id", required=True,
                    help="CR identifier (number or public ID)")
    uc.add_argument("--status", default="", help="New status/state")
    uc.add_argument("--comment", default="", help="Close notes / comment")
    uc.add_argument("--bus-ob-id", default="",
                    help="Cherwell Business Object ID (Cherwell only)")

    args = parser.parse_args()
    platform = detect_platform()

    if args.command == "create-cr":
        platform.create_cr(args)
    elif args.command == "update-cr":
        platform.update_cr(args)


if __name__ == "__main__":
    main()
