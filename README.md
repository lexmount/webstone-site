# Browser Eval Leaderboard

The public leaderboard for our browser and search evaluation work. It presents browsers and search services side by side in sortable tables.

Six benchmark views are published on this site. The evaluation harness is [lexmount/browser-eval](https://github.com/lexmount/browser-eval).

## Benchmarks

### LexBench WebFetch

Live websites, from URL to usable content. The latest import compares six browser versions and configurations on 430 cases across seven categories:

| Category | Cases | Pass criterion |
| --- | --- | --- |
| Static sites | 100 | Complete body text |
| Dynamic sites | 100 | JavaScript-rendered target content present |
| Popular sites | 100 | Body text, item count and link count meet the threshold |
| Anti-bot sites | 100 | Target page returned instead of a challenge page |
| Embedded documents | 10 | PDF and DOCX title and body recovered |
| Embedded media | 17 | Valid image or video links embedded in a web page |
| Direct media | 3 | Downloaded media files match the originals |

The table imported on 2026-11-11 supplies request success, task success, seven category pass counts, and total elapsed time at mean / P50 / P95 in milliseconds. Its evaluation date, timing sample counts and timeout/retry settings were not provided. A successful request only means a response was received; it does not mean the task passed.

Category counts add up to the derived pass totals: 385, 367, 233, 227, 222 and 194. The supplied success rates are retained at one decimal place. The initial 2026-11-10 result remains available through the date selector, with its original combined media category. WebMainBench results are unchanged.

### WebMainBench

Frozen HTML, same pages for every browser: 545 saved documents, scored on five dimensions (full text, code, formula, table content, table structure). The overall score is the mean of the five dimensions.

Browsers covered: Moli, Chromium, Lightpanda, Obscura and Kitesurf.

### LexBench WebSearch

149 scenario queries. The table compares Lexmount, Serper, Browserbase and Bright Data using nDCG@5, Precision@5 and Success@5.

### SimpleQA Verified

773 factual queries. The same four services are compared using Hit@5, MRR@5 and Answer Match@5. MRR remains on its original 0–1 scale.

### LexBench Headless 372

A 372-task subset of [Lexbench Headless Browser](https://github.com/lexmount/Lexbench-Headless-Browser). Seven Moli builds are compared with layout on and off on task success rate, the change in percentage points against the baseline, peak PSS memory and mean latency per task, each paired with its relative change against the baseline. The baseline row measures one task directly and inherits the remaining 371 from shared failure relations; every other row measures all 372 tasks, sampled three times.

### WebArena Verified

812 end-to-end web tasks from [ServiceNow/webarena-verified](https://github.com/ServiceNow/webarena-verified). Six execution setups (Chromium 153, Moli at #731 + #853, Moli v1.1.11, Lightpanda nightly 9813, Obscura 0.2.3 and Kitesurf on Cloudflare Browser Run) are compared on task success rate, end-to-end task latency and per-action latency. Task latency uses all 812 tasks per setup; action latency is measured per action, so its sample count differs by setup. Both latencies report mean, P50 and P95, and lower is better.

The search results were transcribed from the user-provided overview image, with its SHA256 recorded in the result file. The average response times describe 980 calls across both query sets; they are shared measurements, not separate timings for either benchmark. Prices are USD per 1,000 calls. Timing and price columns sort from low to high by default; quality columns sort from high to low. The linked blog is a related report, not a verified version binding for the supplied image.

## Results

Benchmark definitions live in `benchmarks/catalog.json`. It owns Track membership, names, introductions, dataset/report navigation links, and reusable definitions of metrics, categories and table presentation. Provider colors and navigation icons stay in website code.

Daily measurements live directly in each Benchmark's directory, one Benchmark per file:

```text
results/
  lexbench-webfetch/
    lexbench-webfetch-20261110-report.json
    lexbench-webfetch-20261111-report.json
  webmainbench/
    webmainbench-20261110-report.json
```

Each result references a Benchmark `id` and a `definitionId`; it contains method versions/configurations, scores, actual task and category totals, sample counts, execution notes and a source report URL. It contains no Benchmark introduction, metric labels, display colors, format-version field (`schemaVersion` / `version`), `measuredAt` or `source.versionId`. Refer to the linked report for source details. There are no date subdirectories or manually maintained index files.

WebFetch retains separate `combined-media` and `split-media` definitions. A changed metric calculation, category meaning or pass criterion needs a new definition ID; retain old definitions so old results keep their original meaning. Sample counts belong to the daily result, not the reusable definition.

`prepare:data` scans the Benchmark directories, publishes the catalog to `web/public/benchmarks/`, copies the reports into `web/public/results/`, and generates a `reports.json` data bundle for the page. This is generated output, never a source file to maintain. Removed source files are removed from generated output on the next preparation. The page defaults to each Benchmark's latest date, joins results with their exact definitions in memory, and downloads the individual daily report without page metadata. Task sets, page corpora, the evaluation runner and raw logs are not part of this repository.

Pass counts come from the evaluation report or are summed from its category counts. Values the source does not disclose are shown as `—`; a real zero remains zero.

## Local development

Requires Node.js 22.13+ (Node.js 22.18+ recommended for the TypeScript tests). From the repository root:

```sh
npm install
npm run dev
```

Open the local address printed in the terminal, usually <http://127.0.0.1:3000>. Next.js picks the next free port if that one is taken.

Result data is bundled with the page: no token, login, API key or running evaluation is needed to browse it, and viewing works offline once dependencies are installed.

## Static build

```sh
npm run build
python3 -m http.server 5173 --bind 127.0.0.1 --directory web/out
```

Open <http://127.0.0.1:5173>. The output is plain static files and needs no Next.js runtime; do not use `next start`.

## Validation and updates

```sh
npm test
npm run prepare:data
```

To add a result for an existing definition:

1. Add `results/<id>/<id>-YYYYMMDD-report.json`, for example `results/lexbench-webfetch/lexbench-webfetch-20261112-report.json`. Keep exactly one Benchmark in the file, reference its existing `id` and `definitionId`, set a unique result ID, and match `snapshotDate` to the filename (`2026-11-12` in this example). Record actual sample totals, method versions, measurements and provenance; retain `null` for undisclosed values.
2. Run `npm test` and `npm run build`, or restart `npm run dev` for local browsing. No index, catalog or website edits are needed for a new date using an existing definition. With dev already running, `npm run prepare:data` followed by a page refresh also picks up new files.

Discovery runs at startup/build time so the site stays fully static. `prepare:data` rejects invalid dates, filename/Benchmark mismatches, nested directories, symbolic links, duplicate result IDs and invalid measurements. The same Benchmark/date has one fixed filename. A public deployment must be rebuilt and redeployed to publish new files.

For a new Benchmark or evaluation definition, add its metadata to `benchmarks/catalog.json` first. Editing an introduction or related resource link only requires changing the catalog. Restart the dev server or rebuild after changing data or configuration.

The GitHub button in the top-right corner always links to this website's source at <https://github.com/lexmount/browser-eval-site>.

Each benchmark has separate dataset and report links below its introduction,
stored as `datasetUrl` and `reportUrl` in `benchmarks/catalog.json`. The dataset links
for Web Fetch and Web Search follow the public dataset catalog in Browser Eval;
the trajectory benchmarks retain their original dataset repositories.
Catalog reports are related, independently updated pages and may cover a different run
or sample population. A daily result may supply its own `reportUrl` only when that
report is known to describe those results; otherwise it stays `null` and the page
shows the related catalog link. The result file's `source` records the provenance
of the displayed numbers; resource links do not replace it. `Download Report`
downloads the daily result JSON with its definition references and provenance.

Tokens are only ever used outside this repository and are never stored in data, source or build output.
