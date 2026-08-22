#!/usr/bin/env python3
"""Replace every occurrence of one string (e.g. a base URL) with another across a
source tree.

Values are taken from --from/--to or, if omitted, the AUDIOM_ORIGINAL_URL /
AUDIOM_REPLACEMENT_URL environment variables. Only text-like files are touched;
files that are not valid UTF-8 are skipped rather than aborting the run.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

TEXT_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css", ".scss", ".md",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root",
        nargs="?",
        default="ArcGIS/client/your-extensions",
        help="Directory to search (default: ArcGIS/client/your-extensions)",
    )
    parser.add_argument(
        "--from",
        dest="frm",
        default=os.environ.get("AUDIOM_ORIGINAL_URL", ""),
        help="String to search for (default: $AUDIOM_ORIGINAL_URL)",
    )
    parser.add_argument(
        "--to",
        dest="to",
        default=os.environ.get("AUDIOM_REPLACEMENT_URL", ""),
        help="Replacement string (default: $AUDIOM_REPLACEMENT_URL)",
    )
    parser.add_argument(
        "--require-match",
        action="store_true",
        help="Exit non-zero if no occurrences were found (fail the build loudly).",
    )
    return parser.parse_args()


def rewrite_tree(root: Path, frm: str, to: str) -> int:
    """Replace frm with to in every text file under root. Returns total occurrences."""
    total = 0
    files_changed = 0
    for path in root.rglob("*"):
        if "node_modules" in path.parts:
            continue
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print(f"  skip (not utf-8): {path}")
            continue
        count = text.count(frm)
        if count:
            path.write_text(text.replace(frm, to), encoding="utf-8")
            total += count
            files_changed += 1
            print(f"  {count}x  {path}")
    print(f"Replaced {total} occurrence(s) of '{frm}' with '{to}' across {files_changed} file(s).")
    return total


def main() -> int:
    args = parse_args()

    if not args.frm:
        print("::error::search string is empty (set --from or AUDIOM_ORIGINAL_URL)", file=sys.stderr)
        return 2

    root = Path(args.root)
    if not root.is_dir():
        print(f"::error::root directory not found: {root}", file=sys.stderr)
        return 2

    total = rewrite_tree(root, args.frm, args.to)

    if args.require_match and total == 0:
        print(f"::error::no occurrences of '{args.frm}' were found under {root}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
