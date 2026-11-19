#!/usr/bin/env python3
"""Pull rasprg sessions and slides from the IETF Datatracker API.

New meetings are appended to data/meetings.yaml and new slide decks to
data/presentations.yaml as stubs (needs_review: true). Existing entries are
never overwritten, so hand-curated titles, presenters and topics are kept.
Presenters are not part of the slide metadata: fill them in from the meeting
agenda, then remove needs_review.

Usage: python scripts/refresh.py [--dry-run]
"""
import argparse
from pathlib import Path

import requests
import yaml

API = "https://datatracker.ietf.org"
GROUP = "rasprg"
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

session = requests.Session()
session.headers["User-Agent"] = "rasprg-catalog-refresh"


def get(path, **params):
    params["format"] = "json"
    r = session.get(API + path, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def tail(uri):
    return uri.rstrip("/").split("/")[-1]


def load(name, key):
    with open(DATA / name, encoding="utf-8") as f:
        return yaml.safe_load(f)[key]


def dump(name, key, items):
    with open(DATA / name, "w", encoding="utf-8") as f:
        yaml.safe_dump({key: items}, f, allow_unicode=True, sort_keys=False, width=200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    meetings = load("meetings.yaml", "meetings")
    presentations = load("presentations.yaml", "presentations")
    known_m = {m["id"] for m in meetings}
    known_p = {p["id"] for p in presentations}
    new_m, new_p = [], []

    sessions = get("/api/v1/meeting/session/", group__acronym=GROUP, limit=500)["objects"]
    for s in sessions:
        m = get(s["meeting"].replace(API, ""))
        mid = m["number"]
        if mid not in known_m:
            label = f"IETF {mid}" if m["type"].endswith("/ietf/") else mid
            new_m.append({"id": mid, "label": label, "type": tail(m["type"]), "date": m["date"],
                          "location": m.get("city") or "Virtual",
                          "materials": f"{API}/meeting/{mid}/session/{GROUP}", "recording": None})
            known_m.add(mid)
        sps = get("/api/v1/meeting/sessionpresentation/", session=s["id"], limit=200)["objects"]
        for sp in sps:
            name = tail(sp["document"])
            if not name.startswith("slides-") or name in known_p:
                continue
            doc = get(sp["document"].replace(API, ""))
            new_p.append({"id": name, "meeting": mid, "title": doc["title"],
                          "presenters": ["TBD"], "kind": "talk", "topics": [],
                          "slides": f"{API}/meeting/{mid}/materials/{name}",
                          "doc": f"{API}/doc/{name}/", "needs_review": True})
            known_p.add(name)

    for m in new_m:
        print("new meeting:", m["id"])
    for p in new_p:
        print("new slides:", p["id"])
    if not (new_m or new_p):
        print("Catalog is up to date.")
        return
    if args.dry_run:
        return
    meetings.extend(new_m)
    meetings.sort(key=lambda m: m["date"])
    presentations.extend(new_p)
    dump("meetings.yaml", "meetings", meetings)
    dump("presentations.yaml", "presentations", presentations)
    print("Fill in presenters/topics for the stubs, then run scripts/build.py.")


if __name__ == "__main__":
    main()
