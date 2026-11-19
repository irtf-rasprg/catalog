# RASPRG presentations catalog

A browsable catalog of the presentations given at the IRTF
[Research and Analysis of Standard-Setting Processes Research Group (rasprg)](https://datatracker.ietf.org/rg/rasprg/about/).
Each entry links to its slides on the IETF Datatracker and can be filtered by
topic, meeting and presenter. Every filtered view is a shareable URL, for example
`?topic=ai-llm`, `?meeting=127` or `?presenter=Colin%20Perkins`.

## Layout

| Path | What it is |
|------|------------|
| `data/presentations.yaml` | One entry per slide deck: title, presenters, affiliation, kind, topics, links. Source of truth, curated by hand. |
| `data/meetings.yaml` | rasprg sessions (IETF meetings and interims), with materials and recording links. |
| `data/topics.yaml` | Topic taxonomy used to categorize presentations. |
| `scripts/refresh.py` | Pulls new sessions and slides from the Datatracker API and adds them as stubs. |
| `scripts/build.py` | Validates the YAML and writes `docs/data.json`. |
| `docs/` | Static site (no build step, no dependencies), suitable for GitHub Pages. |

## Updating after a meeting

```sh
pip install -r requirements.txt
python scripts/refresh.py      # adds new meetings and slide decks (needs_review: true)
# edit data/presentations.yaml: set presenters, affiliation, kind and topics
# from the meeting agenda, then delete the needs_review line
python scripts/build.py        # validates and regenerates docs/data.json
```

`refresh.py` never overwrites existing entries, so curated fields are safe.
CI runs `build.py` on every pull request and fails if the data is invalid or
`docs/data.json` was not regenerated.

### Entry kinds

- `talk`: a research presentation (shown by default)
- `panel`: a panel statement (shown by default)
- `chairs`: chairs' welcome / Note Well slides (hidden unless "Include chairs' slides" is ticked)
- `consolidated`: a combined deck of a whole session (hidden by default)

## Viewing locally

```sh
python -m http.server -d docs 8000   # then open http://localhost:8000
```

## Data source

All materials are hosted by the [IETF Datatracker](https://datatracker.ietf.org/rg/rasprg/meetings/).
Presenter names and affiliations come from the published session agendas and minutes.
