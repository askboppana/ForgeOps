#!/usr/bin/env python3
"""
cherwell-integration.py — Cherwell ITSM integration for ForgeOps pipelines.

Subcommands:
  create-cr  Create a Change Request
  update-cr  Update a Change Request status

Uses OAuth2 client_credentials flow. Uses only urllib (no pip dependencies).
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
import urllib.parse


def get_oauth_token(url, client_id, client_secret):
    """Obtain an OAuth2 access token using client_credentials grant."""
    token_url = f"{url.rstrip('/')}/CherwellAPI/token"
    data = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode("utf-8")

    req = urllib.request.Request(
        token_url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["access_token"]
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"Cherwell OAuth error ({e.code}): {error_body}", file=sys.stderr)
        sys.exit(1)
    except (KeyError, json.JSONDecodeError) as e:
        print(f"Cherwell OAuth response error: {e}", file=sys.stderr)
        sys.exit(1)


def cherwell_request(url, access_token, path, method="GET", data=None):
    """Make an authenticated request to the Cherwell REST API."""
    full_url = f"{url.rstrip('/')}/CherwellAPI/api/V1/{path.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {access_token}",
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
        print(f"Cherwell API error ({e.code}): {error_body}", file=sys.stderr)
        sys.exit(1)


def get_business_object_summary(url, access_token, bus_ob_name):
    """Get the business object summary by name."""
    result = cherwell_request(
        url, access_token,
        f"getbusinessobjectsummary/busobname/{bus_ob_name}",
    )
    if isinstance(result, list) and len(result) > 0:
        return result[0]
    return result


def get_template(url, access_token, bus_ob_id):
    """Get a business object template."""
    data = {
        "busObId": bus_ob_id,
        "includeRequired": True,
        "includeAll": True,
    }
    return cherwell_request(
        url, access_token,
        "getbusinessobjecttemplate",
        method="POST", data=data,
    )


def set_field_value(fields, field_name, value):
    """Set a field value in the template fields list."""
    for field in fields:
        if field.get("displayName", "").lower() == field_name.lower() or \
           field.get("name", "").lower() == field_name.lower():
            field["dirty"] = True
            field["value"] = value
            return True
    return False


# ── Subcommand: create-cr ──

def cmd_create_cr(args):
    """Create a Cherwell Change Request."""
    access_token = get_oauth_token(args.url, args.client_id, args.client_secret)

    # Get the ChangeRequest business object
    summary = get_business_object_summary(args.url, access_token, "ChangeRequest")
    bus_ob_id = summary["busObId"]

    # Get template
    template = get_template(args.url, access_token, bus_ob_id)
    fields = template.get("fields", [])

    # Populate fields
    set_field_value(fields, "Summary",
                    f"Deploy {args.app} v{args.version} to {args.environment}")
    set_field_value(fields, "Description",
                    f"Automated deployment of {args.app} version {args.version} "
                    f"to {args.environment} environment via ForgeOps pipeline.")
    set_field_value(fields, "Type", "Normal")
    set_field_value(fields, "Priority", "3 - Moderate")
    set_field_value(fields, "Status", "New")
    set_field_value(fields, "Requested By", args.approver)
    set_field_value(fields, "Category", "Software Deployment")

    # Save the business object
    save_data = {
        "busObId": bus_ob_id,
        "fields": fields,
        "persist": True,
    }
    result = cherwell_request(
        args.url, access_token,
        "savebusinessobject",
        method="POST", data=save_data,
    )

    cr_id = result.get("busObPublicId", result.get("busObRecId", "UNKNOWN"))
    print(cr_id)
    return cr_id


# ── Subcommand: update-cr ──

def cmd_update_cr(args):
    """Update a Cherwell Change Request status."""
    access_token = get_oauth_token(args.url, args.client_id, args.client_secret)

    # Get the ChangeRequest business object
    summary = get_business_object_summary(args.url, access_token, "ChangeRequest")
    bus_ob_id = summary["busObId"]

    # Get current record
    result = cherwell_request(
        args.url, access_token,
        f"getbusinessobject/busobid/{bus_ob_id}/publicid/{args.cr_id}",
    )

    fields = result.get("fields", [])
    bus_ob_rec_id = result.get("busObRecId", "")

    # Update status
    set_field_value(fields, "Status", args.status)

    # Save
    save_data = {
        "busObId": bus_ob_id,
        "busObRecId": bus_ob_rec_id,
        "busObPublicId": args.cr_id,
        "fields": fields,
        "persist": True,
    }
    cherwell_request(
        args.url, access_token,
        "savebusinessobject",
        method="POST", data=save_data,
    )

    print(f"Change Request {args.cr_id} updated to status: {args.status}")


# ── CLI ──

def main():
    parser = argparse.ArgumentParser(description="ForgeOps Cherwell Integration")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create-cr
    cc = subparsers.add_parser("create-cr", help="Create a Change Request")
    cc.add_argument("--url", required=True, help="Cherwell base URL")
    cc.add_argument("--client-id", required=True, help="OAuth2 client ID")
    cc.add_argument("--client-secret", required=True, help="OAuth2 client secret")
    cc.add_argument("--app", required=True, help="Application name")
    cc.add_argument("--version", required=True, help="Application version")
    cc.add_argument("--environment", required=True, help="Target environment")
    cc.add_argument("--approver", required=True, help="Approver name")

    # update-cr
    uc = subparsers.add_parser("update-cr", help="Update a Change Request")
    uc.add_argument("--url", required=True, help="Cherwell base URL")
    uc.add_argument("--client-id", required=True, help="OAuth2 client ID")
    uc.add_argument("--client-secret", required=True, help="OAuth2 client secret")
    uc.add_argument("--cr-id", required=True, help="Change Request public ID")
    uc.add_argument("--status", required=True, help="New status")

    args = parser.parse_args()

    if args.command == "create-cr":
        cmd_create_cr(args)
    elif args.command == "update-cr":
        cmd_update_cr(args)


if __name__ == "__main__":
    main()
