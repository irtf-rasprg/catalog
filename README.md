# RASPRG presentations catalog

A browsable catalog of the presentations given at the IRTF
[Research and Analysis of Standard-Setting Processes Research Group (rasprg)](https://datatracker.ietf.org/rg/rasprg/about/).
Each entry links to its slides on the IETF Datatracker, shows the abstract from
the session agenda and links to related tools, papers and other resources, and
can be filtered by topic, meeting, presenter and resource type. Every filtered view is a shareable URL, for example
`?topic=ai-llm`, `?meeting=127` or `?presenter=Colin%20Perkins`.

## Layout

| Path | What it is |
|------|------------|
| `data/presentations.yaml` | One entry per slide deck: title, presenters, affiliation, kind, topics, links, resources. Source of truth, curated by hand. |
| `data/abstracts.yaml` | Talk abstracts quoted from the session agendas, keyed by presentation id. |
| `data/meetings.yaml` | rasprg sessions (IETF meetings and interims), with materials and recording links. |
| `data/topics.yaml` | Topic taxonomy used to categorize presentations. |
| `scripts/refresh.py` | Pulls new sessions, slides, recordings and agendas from the Datatracker API; new decks become stubs. |
| `scripts/build.py` | Validates the YAML and writes `docs/data.json`. |
| `docs/` | Static site (no build step; Bootstrap and Bootstrap Icons are vendored in `docs/vendor/`), suitable for GitHub Pages. |

## Automatic updates

`.github/workflows/refresh.yml` runs `refresh.py` and `build.py` on a schedule:
daily in March, April, July, August, November and December (each IETF meeting
month and the month after), and every Monday the rest of the year for interims.
It can also be started by hand from the Actions tab ("Run workflow").

When the Datatracker has something new (a meeting, a slide deck, a recording or
agenda link), the workflow opens a pull request on the `automated/catalog-refresh`
branch, assigned to the chairs for review. The PR body lists each new deck as a
checklist: fill in presenters, topics, abstract and resources on that branch,
run `build.py`, and merge. While that PR is open, later runs skip, so hand edits
on the branch are never overwritten. Nothing is published until the PR is merged.

Repository settings this needs: Settings → Actions → General → Workflow
permissions → "Allow GitHub Actions to create and approve pull requests".

## Updating by hand

```sh
pip install -r requirements.txt
python scripts/refresh.py      # adds new meetings, recordings/agendas, slide decks (needs_review: true)
# edit data/presentations.yaml: set presenters, affiliation, kind and topics
# from the meeting agenda, then delete the needs_review line
python scripts/build.py        # validates, regenerates docs/data.json and cache-busts CSS/JS links
```

`refresh.py` never overwrites existing entries or links that are already set, so curated fields are safe.
CI runs `build.py` on every pull request and fails if the data is invalid or
`docs/data.json` was not regenerated.

### Abstracts and resources

- **Abstracts** go in `data/abstracts.yaml`, quoted from the session agenda
  (each meeting's `agenda:` link). Leave a talk out if the agenda has no
  abstract; the site then says so instead of showing invented text.
- **Resources** are links found in the agenda or the slides, as a list on the
  presentation entry:

  ```yaml
  resources:
  - type: tool        # tool, code, paper, draft, report, data, artifact, slides, website, reference
    title: RFCGPT
    url: https://cryptography.consulting/rfcgpt
    source: slides    # agenda, slides, presenter or other
  ```

On the site, each talk has separate **Abstract** and **Resources** buttons, and
the "Show all abstracts" / "Show all resources" switches expand every card at
once (`?abs=1`, `?res=1` in the URL). "Has resource" filters to talks with,
for example, a tool or a paper.

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

## License

Code is [MIT](LICENSE). Catalog data is public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Linked slides and quoted abstracts are IRTF Contributions and stay under the
IETF/IRTF IPR terms (BCP 78/79, Note Well). Details in [LICENSE.md](LICENSE.md).
