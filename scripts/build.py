#!/usr/bin/env python3
"""Validate the YAML catalog and export docs/data.json for the static site."""
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
KINDS = {"talk", "panel", "chairs", "consolidated"}


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main():
    topics = load("topics.yaml")["topics"]
    meetings = load("meetings.yaml")["meetings"]
    presentations = load("presentations.yaml")["presentations"]

    topic_ids = {t["id"] for t in topics}
    meeting_ids = {m["id"] for m in meetings}
    errors = []
    seen = set()
    for p in presentations:
        pid = p.get("id", "<missing id>")
        if pid in seen:
            errors.append(f"{pid}: duplicate id")
        seen.add(pid)
        if p.get("meeting") not in meeting_ids:
            errors.append(f"{pid}: unknown meeting {p.get('meeting')!r}")
        if p.get("kind") not in KINDS:
            errors.append(f"{pid}: kind must be one of {sorted(KINDS)}")
        for t in p.get("topics") or []:
            if t not in topic_ids:
                errors.append(f"{pid}: unknown topic {t!r}")
        if not p.get("presenters"):
            errors.append(f"{pid}: no presenters")
        if p.get("kind") in {"talk", "panel"} and not p.get("topics") and not p.get("needs_review"):
            errors.append(f"{pid}: talks need at least one topic")

    if errors:
        print("Catalog validation failed:", *errors, sep="\n  ")
        sys.exit(1)

    out = {"topics": topics, "meetings": meetings, "presentations": presentations}
    target = ROOT / "docs" / "data.json"
    target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    talks = sum(1 for p in presentations if p["kind"] in {"talk", "panel"})
    print(f"OK: {len(presentations)} entries ({talks} talks/panel statements), "
          f"{len(meetings)} meetings -> {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
