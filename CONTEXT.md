# Axum Tower — Nightly Reports · UI context for review

This document is written for an AI/design reviewer (Lovable). It explains what
the app is, who uses it, what the data looks like, the current UI, the design
system, and — most importantly — **where I want help**. Please read the "What
I'm trying to get out of this" section; that's the north star.

---

## 1. What this is

A **nightly-monitoring viewer** for an ESP32-S3 device called the **Axum
solar-tracking tower** (a motorized tower in Houston, TX that rotates to follow
the sun). Every night the device's serial log is captured, run through the
Claude API, and turned into a structured **markdown report** with a verdict and
per-subsystem findings. This web app displays those reports.

The pipeline (not part of the UI, but useful context):

```
ESP32 serial log  ->  Python preprocess (digest)  ->  Claude API  ->  markdown report
                                                                          |
                                                                  public/reports/*.md
                                                                          |
                                                            THIS WEB APP renders them
```

One report = one night = one device session. Reports accumulate day over day.

## 2. Who uses it & how

- A **hardware/firmware engineer** (me) checking each morning whether the tower
  ran cleanly overnight, and watching for slow regressions across many nights.
- Used on a **laptop browser**, occasionally left open as a dashboard. Soon to
  be hosted internally on a company domain for the team.
- Low traffic, internal tool — clarity and signal matter far more than flashy
  interactivity.

## 3. What I'm trying to get out of this  ← **the important part**

I want to **get the most out of the tower data and produce clear analysis.**
Concretely:

1. **Catch silent issues.** The worst outcome is the tower failing in a subtle
   way for days without anyone noticing. The UI should make a bad night
   *impossible to miss* and make a slow drift *visible*.
2. **Day-over-day consistency.** I care less about one report in isolation and
   more about **trends**: Is MQTT uptime degrading? Are DNS failures climbing?
   Did motion completion drop from 99% to 80%? Right now each report is a
   separate page; there's no cross-night view.
3. **Fast triage.** On open, I want the answer to "is everything OK, and if not,
   what and since when?" in seconds — before reading prose.

If you only give me advice on one thing, make it **how to visualize trends and
surface regressions across the nightly series**, because the data is already
there (every report is parsed into structured fields — see below) and the
current UI doesn't exploit it.

## 4. The data in each report

Reports are markdown. The app already parses them into structured fields
(`src/lib/report/parse.ts`, `storage.ts`). A typical report contains:

- **Meta line:** Device, **Session date** (used as the report's id/key),
  Firmware version, time range the log covers.
- **VERDICT:** `PASS` / `WARN` / `FAIL` + a one-sentence summary. This is the
  headline signal.
- **Headline Metrics** table — e.g. Boots, Crashes/panics, Movements started vs
  completed (a %), Flagged movements, MQTT connected/disconnected events, **MQTT
  uptime %**, **DNS failures** (a count), confirmed MQTT publishes, encoder
  status, NVS writes. **These are the numbers I'd want trended over time.**
- **Findings by Subsystem** — sections for Stability & Boots, Motion Integrity,
  Encoder Health, Homing, Connectivity, Persistence. The app extracts a
  per-subsystem pass/warn/fail status from a table.
- **Likely Bugs / Root Causes** and **Suggestions** — prose.
- **Trend Note** — the model already compares to the previous session in prose,
  but nothing visual.

Recurring real-world signals in the data: a fatal `ESP_ERR_TIMEOUT` Wi-Fi crash,
MQTT dropping and never recovering, hundreds of DNS failures, motion completion
rate, homing success. These are the things a good dashboard would chart.

## 5. Current UI (what exists today)

Two routes (TanStack Router, file-based):

- **`/` — index** (`src/routes/index.tsx`): header + an upload card + a **list of
  reports** (one row per date) showing date, title, subsystem pills, and a
  PASS/WARN/FAIL pill. Clicking a row opens a **summary dialog**
  (`ReportSummaryDialog.tsx`) with the verdict and subsystem statuses, and a
  "View full report" button. Empty state explains reports arrive automatically.
- **`/report/$id`** (`src/routes/report.$id.tsx`): the **full report**, rendered
  as styled markdown (`ReportView.tsx`, `Markdown.tsx`) with a verdict hero, a
  table of contents, metric tables, and timeline blocks.

Reports load automatically from `/reports/index.json` (the server writes them);
the list also auto-refreshes every 5 minutes. There is **no trend/overview
visualization** — that's the main gap.

Key components to look at: `report/ReportList.tsx`, `ReportSummaryDialog.tsx`,
`ReportView.tsx`, `VerdictHero.tsx`, `StatusPill.tsx`, `Markdown.tsx`,
`TimelineBlock.tsx`, `Callout.tsx`.

## 6. Design system (please respect / build on this)

The aesthetic is **editorial / "printed report"** — warm, calm, typographic, not
a neon SaaS dashboard. Defined in `src/styles.css` (Tailwind v4, OKLCH tokens):

- **Type:** serif **Fraunces** for headings, **Inter** for body, **JetBrains
  Mono** for numbers/metadata.
- **Palette:** warm paper background, deep ink text, **burnt-sienna accent**.
  Status colors: green `--pass`, amber `--warn`, red `--fail`, each with a
  `-soft` background variant. Dark mode tokens exist.
- Generous whitespace, thin rules (`--rule`), rounded surfaces, tabular numerals
  for figures. shadcn/ui components are available (`src/components/ui/*`).
- `recharts` is already a dependency — usable for any trend charts you suggest.

Whatever you propose should feel like it belongs in this typographic system —
ideally charts and trend views that read like a well-set print analytics page,
not a generic admin panel.

## 7. Tech stack & constraints

- **TanStack Start** (React 19 SSR) + **TanStack Router** (file-based) + Vite.
- **Tailwind CSS v4**, **shadcn/ui**, **lucide-react** icons, **recharts**.
- Reports are static markdown files fetched client-side; no backend API beyond
  serving files. Any new view must work from the already-parsed report fields
  (no new server needed — though I can add fields to the report generator if a
  visualization needs them).

## 8. What I'd love feedback on

1. **A cross-night overview / dashboard** above or beside the list: verdict
   history (a row of PASS/WARN/FAIL over the last N nights), sparklines or small
   charts for MQTT uptime %, DNS failures, motion completion %. How would you
   lay this out in this editorial style?
2. **Surfacing regressions:** how to visually flag "this metric got worse vs the
   trailing average" so silent drifts stand out.
3. **The report list** — is one-row-per-date with pills the right density? Could
   it carry a mini metric strip per night?
4. **The full report page** — is the TOC + markdown layout the best way to read a
   dense technical report, or would a tabbed/sectioned layout serve triage
   better?
5. **Empty/loading/error states** and overall information hierarchy for
   fast morning triage.

Concrete mockups, layout sketches, or component-level suggestions that fit the
existing design tokens are exactly what I'm after. Thank you!
