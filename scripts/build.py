#!/usr/bin/env python3
"""Validate the YAML catalog and export docs/data.json for the static site."""
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
KINDS = {"talk", "panel", "chairs", "consolidated"}
RESOURCE_TYPES = {"paper", "tool", "code", "data", "draft", "report", "artifact", "slides", "website", "reference"}
RESOURCE_SOURCES = {"agenda", "slides", "presenter", "other"}


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main():
    topics = load("topics.yaml")["topics"]
    meetings = load("meetings.yaml")["meetings"]
    presentations = load("presentations.yaml")["presentations"]
    abstracts = load("abstracts.yaml").get("abstracts") or {}

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
        for i, r in enumerate(p.get("resources") or []):
            where = f"{pid}: resources[{i}]"
            if r.get("type") not in RESOURCE_TYPES:
                errors.append(f"{where}: type must be one of {sorted(RESOURCE_TYPES)}")
            if r.get("source") not in RESOURCE_SOURCES:
                errors.append(f"{where}: source must be one of {sorted(RESOURCE_SOURCES)}")
            if not r.get("title"):
                errors.append(f"{where}: missing title")
            if not str(r.get("url", "")).startswith(("http://", "https://")):
                errors.append(f"{where}: url must be http(s)")

    for aid, text in abstracts.items():
        if aid not in seen:
            errors.append(f"abstracts.yaml: {aid}: no such presentation")
        elif not isinstance(text, str) or not text.strip():
            errors.append(f"abstracts.yaml: {aid}: empty abstract")

    if errors:
        print("Catalog validation failed:", *errors, sep="\n  ")
        sys.exit(1)

    for p in presentations:
        if p["id"] in abstracts:
            p["abstract"] = abstracts[p["id"]].strip()

    out = {"topics": topics, "meetings": meetings, "presentations": presentations}
    target = ROOT / "docs" / "data.json"
    target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    talks = [p for p in presentations if p["kind"] in {"talk", "panel"}]
    with_abs = sum(1 for p in talks if p.get("abstract"))
    with_res = sum(1 for p in talks if p.get("resources"))
    print(f"OK: {len(presentations)} entries ({len(talks)} talks/panel statements, "
          f"{with_abs} with abstracts, {with_res} with resources), "
          f"{len(meetings)} meetings -> {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
