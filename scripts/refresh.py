#!/usr/bin/env python3
"""Pull rasprg sessions, slides, recordings and agendas from the IETF Datatracker API.

- New meetings are appended to data/meetings.yaml.
- Missing `recording:` and `agenda:` links on any meeting are filled in from the
  session's materials (a recording-* document's video URL, the agenda-* document).
  Links that are already set are never changed.
- New slide decks are appended to data/presentations.yaml as stubs
  (needs_review: true). Existing entries are never overwritten, so hand-curated
  titles, presenters and topics are kept.

Presenters are not part of the slide metadata: fill them in from the meeting
agenda, then remove needs_review. Abstracts (data/abstracts.yaml) and resource
links (resources: in presentations.yaml) are curated by hand from the agenda
and slides; the summary lists which new talks still need them.

Usage: python scripts/refresh.py [--dry-run] [--summary FILE] [--todo FILE]
  --summary FILE  write a Markdown summary of this run's changes (only written
                  when something changed)
  --todo FILE     write a Markdown checklist of every entry still marked
                  needs_review (always written; empty list when none remain)
.github/workflows/refresh.yml uses both: the summary becomes the commit
message and an issue comment, the to-do list the body of a tracking issue.
"""
import argparse
import time
from pathlib import Path

import requests
import yaml

API = "https://datatracker.ietf.org"
GROUP = "rasprg"
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

session = requests.Session()
session.headers["User-Agent"] = "rasprg-catalog-refresh (+https://github.com/irtf-rasprg/catalog)"


def get(path, **params):
    """GET a Datatracker API path (absolute or relative URI), retrying transient errors."""
    params["format"] = "json"
    url = path if path.startswith("http") else API + path
    for attempt in range(4):
        try:
            r = session.get(url, params=params, timeout=30)
            if r.status_code < 500 and r.status_code != 429:
                r.raise_for_status()
                return r.json()
        except (requests.ConnectionError, requests.Timeout):
            if attempt == 3:
                raise
        time.sleep(5 * 2 ** attempt)
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


def write_todo(path, presentations, abstracts):
    stubs = [p for p in presentations if p.get("needs_review")]
    lines = []
    for p in stubs:
        missing = []
        if not p.get("presenters") or "TBD" in p["presenters"]:
            missing.append("presenters")
        if not p.get("topics"):
            missing.append("topics")
        if p["id"] not in abstracts:
            missing.append("abstract")
        if not p.get("resources"):
            missing.append("resources")
        need = ", ".join(missing) or "check and remove needs_review"
        lines.append(f"- [ ] {p['meeting']}: [{p['title']}]({p['slides']}) (`{p['id']}`): {need}")
    Path(path).write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return len(stubs)


def write_summary(path, new_m, filled, new_p):
    lines = []
    if new_m:
        lines += ["### New meetings", ""] + [f"- {m['label']} ({m['date']}, {m['location']})" for m in new_m] + [""]
    if filled:
        lines += ["### Links added to existing meetings", ""] + [f"- {mid}: {field} {url}" for mid, field, url in filled] + [""]
    if new_p:
        lines += ["### New slide decks (published as stubs, need presenters/topics/abstract)", ""]
        lines += [f"- {p['meeting']}: [{p['title']}]({p['slides']})" for p in new_p] + [""]
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--summary", metavar="FILE")
    ap.add_argument("--todo", metavar="FILE")
    args = ap.parse_args()

    meetings = load("meetings.yaml", "meetings")
    presentations = load("presentations.yaml", "presentations")
    by_id = {m["id"]: m for m in meetings}
    known_p = {p["id"] for p in presentations}
    new_m, new_p, filled = [], [], []

    sessions = get("/api/v1/meeting/session/", group__acronym=GROUP, limit=500)["objects"]
    for s in sessions:
        m = get(s["meeting"])
        mid = m["number"]
        if mid not in by_id:
            label = f"IETF {mid}" if m["type"].rstrip("/").endswith("ietf") else mid
            entry = {"id": mid, "label": label, "type": tail(m["type"]), "date": m["date"],
                     "location": m.get("city") or "Virtual",
                     "materials": f"{API}/meeting/{mid}/session/{GROUP}", "recording": None,
                     "agenda": None}
            by_id[mid] = entry
            new_m.append(entry)
        meeting = by_id[mid]

        sps = get("/api/v1/meeting/sessionpresentation/", session=s["id"], limit=200)["objects"]
        for sp in sorted(sps, key=lambda x: x.get("order") or 0):
            name = tail(sp["document"])
            if name.startswith("recording-") and not meeting.get("recording"):
                url = get(sp["document"]).get("external_url")
                if url:
                    meeting["recording"] = url
                    if meeting not in new_m:
                        filled.append((mid, "recording", url))
            elif name.startswith("agenda-") and not meeting.get("agenda"):
                meeting["agenda"] = f"{API}/doc/{name}/"
                if meeting not in new_m:
                    filled.append((mid, "agenda", meeting["agenda"]))
            elif name.startswith("slides-") and name not in known_p:
                doc = get(sp["document"])
                new_p.append({"id": name, "meeting": mid, "title": doc["title"],
                              "presenters": ["TBD"], "kind": "talk", "topics": [],
                              "slides": f"{API}/meeting/{mid}/materials/{name}",
                              "doc": f"{API}/doc/{name}/", "needs_review": True})
                known_p.add(name)

    for m in new_m:
        print("new meeting:", m["id"])
    for mid, field, url in filled:
        print(f"{mid}: added {field} {url}")
    for p in new_p:
        print("new slides:", p["id"])
    if args.todo:
        abstracts = (yaml.safe_load(open(DATA / "abstracts.yaml", encoding="utf-8")) or {}).get("abstracts") or {}
        n = write_todo(args.todo, presentations + new_p, abstracts)
        print(f"{n} entries still need review.")
    if not (new_m or new_p or filled):
        print("Catalog is up to date.")
        return
    if args.summary:
        write_summary(args.summary, new_m, filled, new_p)
    if args.dry_run:
        return
    meetings = sorted(by_id.values(), key=lambda m: m["date"])
    presentations.extend(new_p)
    dump("meetings.yaml", "meetings", meetings)
    dump("presentations.yaml", "presentations", presentations)
    if new_p:
        print("Fill in presenters/topics for the stubs, then run scripts/build.py.")


if __name__ == "__main__":
    main()
