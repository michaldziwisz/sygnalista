#!/usr/bin/env python3
from __future__ import annotations

import json
import secrets
import sys


def main(argv: list[str]) -> int:
    app_ids = [a.strip() for a in argv[1:] if a.strip()]
    if not app_ids:
        print("Usage: generate_app_tokens.py <appId> [appId...]", file=sys.stderr)
        return 2

    tokens = {app_id: secrets.token_urlsafe(32) for app_id in app_ids}
    print(json.dumps(tokens, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

