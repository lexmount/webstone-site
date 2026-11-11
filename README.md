# Browser Eval Leaderboard

The public leaderboard for our browser and search evaluation work. It presents browsers and search services side by side in sortable tables.

Six benchmark views are published on this site. The evaluation harness is [lexmount/browser-eval](https://github.com/lexmount/browser-eval).

## Benchmarks

### LexBench Web Fetch

Live websites, from URL to usable content. The published v1 result compares six browser versions and configurations on 430 cases across seven categories:

| Category | Cases | Pass criterion |
| --- | --- | --- |
| Static sites | 100 | Complete body text |
| Dynamic sites | 100 | JavaScript-rendered target content present |
| Popular sites | 100 | Body text, item count and link count meet the threshold |
| Anti-bot sites | 100 | Target page returned instead of a challenge page |
| Embedded documents | 10 | PDF and DOCX title and body recovered |
| Embedded media | 17 | Valid image or video links embedded in a web page |
| Direct media | 3 | Downloaded media files match the originals |

The table supplies request success, task success, seven category pass counts, and total elapsed time at mean / P50 / P95 in milliseconds. Its evaluation date, timing sample counts and timeout/retry settings were not provided. A successful request only means a response was received; it does not mean the task passed.

Category counts add up to the derived pass totals: 385, 367, 233, 227, 222 and 194. The supplied success rates are retained at one decimal place. The published v1 result reports embedded media and direct media separately. WebMainBench results are unchanged.

### LexBench WebMainBench

Frozen HTML, same pages for every browser: 545 saved documents from the corrected WebMainBench edition, scored on five dimensions (full text, code, formula, table content, table structure). The overall score is the mean of the five dimensions.

Browsers covered: Moli, Chromium, Lightpanda, Obscura and Kitesurf.

### LexBench Web Search

149 scenario queries. The table compares Lexmount, Serper, Browserbase and Bright Data using nDCG@5, Precision@5 and Success@5.

### LexBench SimpleQA Verified

773 factual queries. The same four services are compared using Hit@5, MRR@5 and Answer Match@5. MRR remains on its original 0–1 scale.

### LexBench Headless Browser

A 372-task subset of the historical [Lexbench Headless Browser](https://github.com/lexmount/Lexbench-Headless-Browser) protocol, published against the linked Hugging Face export. Seven Moli builds are compared with layout on and off on task success rate, the change in percentage points against the baseline, peak PSS memory and mean latency per task, each paired with its relative change against the baseline. The baseline row measures one task directly and inherits the remaining 371 from shared failure relations; every other row measures all 372 tasks, sampled three times.

### LexBench WebArena Replay

812 end-to-end replay tasks derived from [ServiceNow/webarena-verified](https://github.com/ServiceNow/webarena-verified). Six execution setups (Chromium 153, Moli at #731 + #853, Moli v1.1.11, Lightpanda nightly 9813, Obscura 0.2.3 and Kitesurf on Cloudflare Browser Run) are compared on task success rate, end-to-end task latency and per-action latency. Task latency uses all 812 tasks per setup; action latency is measured per action, so its sample count differs by setup. Both latencies report mean, P50 and P95, and lower is better.

### Dataset alignment

Page titles use natural English, while Dataset links reproduce the official Hugging Face names:

| Benchmark view | Dataset |
| --- | --- |
| LexBench Web Fetch | [LexBench-Web-Fetch](https://huggingface.co/datasets/Lexmount/LexBench-Web-Fetch) |
| LexBench WebMainBench | [LexBench-WebMainBench](https://huggingface.co/datasets/Lexmount/LexBench-WebMainBench) |
| LexBench Web Search | [LexBench-Web-Search](https://huggingface.co/datasets/Lexmount/LexBench-Web-Search) |
| LexBench SimpleQA Verified | [LexBench-SimpleQA-Verified](https://huggingface.co/datasets/Lexmount/LexBench-SimpleQA-Verified) |
| LexBench Headless Browser | [LexBench-Headless-Browser](https://huggingface.co/datasets/Lexmount/LexBench-Headless-Browser) |
| LexBench WebArena Replay | [LexBench-WebArena-Replay](https://huggingface.co/datasets/Lexmount/LexBench-WebArena-Replay) |

Each published version records a `datasetDifference` paragraph describing how its task population, selection, reference answers or scoring differ from the linked Dataset. Known differences include Web Fetch using the 430-task edition rather than the current 550-task edition, SimpleQA Verified using 773 questions rather than 831, and Headless Browser using the historical 372-task protocol rather than the current 1,928-task catalog.

The search results were transcribed from the user-provided overview image, with its SHA256 recorded in the result file. The average response times describe 980 calls across both query sets; they are shared measurements, not separate timings for either benchmark. Prices are USD per 1,000 calls. Timing and price columns sort from low to high by default; quality columns sort from high to low. The linked blog is a related report, not a verified version binding for the supplied image.

## Results

Benchmark definitions live in `benchmarks/catalog.json`. It owns Track membership, titles, official Dataset names, introductions, dataset/report navigation links, and reusable definitions of metrics, categories and table presentation. Provider colors and navigation icons stay in website code.

Published measurements live directly in each Benchmark's directory, one Benchmark and one version per file:

```text
results/
  lexbench-webfetch/
    lexbench-webfetch-v1-report.json
  webmainbench/
    webmainbench-v1-report.json
```

Each result references a Benchmark `id`, a `definitionId` and its own `version`; it contains method versions/configurations, scores, actual task and category totals, sample counts, execution notes and a source report URL. It also contains a required `datasetDifference` paragraph. It contains no Benchmark introduction, metric labels, display colors, `snapshotDate`, `dateKind`, format-version field (`schemaVersion`) or `measuredAt`. Refer to the linked report for source details. There are no date subdirectories or manually maintained index files.

`version` is a per-Benchmark release number (`v1`, `v2`, `v12`), not a browser version, Dataset revision or import date. Latest means the highest integer; each Benchmark selects its own latest version.

Web Fetch publishes the `split-media` definition. A changed metric calculation, category meaning or pass criterion needs a new definition ID; retain old definitions so old results keep their original meaning. Sample counts belong to the published result, not the reusable definition.

`prepare:data` scans the Benchmark directories, publishes the catalog to `web/public/benchmarks/`, copies the reports into `web/public/results/`, and generates a `reports.json` data bundle for the page. This is generated output, never a source file to maintain. Removed source files are removed from generated output on the next preparation. The page defaults to each Benchmark's latest version, joins results with their exact definitions in memory, and downloads the individual version report without page metadata. Task sets, page corpora, the evaluation runner and raw logs are not part of this repository.

Pass counts come from the evaluation report or are summed from its category counts. Values the source does not disclose are shown as `—`; a real zero remains zero.

## Table behavior

The default ranking metric is the first numeric column after the provider. Task success leads Web Fetch, Overall leads WebMainBench, nDCG@5 leads Web Search, Hit@5 leads SimpleQA Verified, and task success leads both agent benchmarks. Clicking another header sorts by it without moving the column.

Every numeric column computes its own best value from the metric direction. Ties are all highlighted; undisclosed values and columns with fewer than two disclosed values have no winner. The currently sorted header is highlighted separately.

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

To add a version for an existing definition:

1. Add `results/<id>/<id>-vN-report.json`, for example `results/lexbench-webfetch/lexbench-webfetch-v3-report.json`. Use the next free positive integer for that Benchmark. Keep exactly one Benchmark in the file, reference its existing `id` and `definitionId`, set the top-level `id` to `<id>-vN` and `version` to `vN`, and write an English `datasetDifference` paragraph. Record actual sample totals, method versions, measurements and provenance; retain `null` for undisclosed values.
2. Run `npm test` and `npm run build`, or restart `npm run dev` for local browsing. No index, catalog or website edits are needed for a new version using an existing definition. With dev already running, `npm run prepare:data` followed by a page refresh also picks up new files.

Discovery runs at startup/build time so the site stays fully static. `prepare:data` rejects invalid versions, filename/Benchmark/version mismatches, nested directories, symbolic links, duplicate result IDs, non-English or missing `datasetDifference`, and invalid measurements. The same Benchmark/version has one fixed filename. A public deployment must be rebuilt and redeployed to publish new files.

For a new Benchmark or evaluation definition, add its metadata to `benchmarks/catalog.json` first, including `datasetName` matching the final segment of `datasetUrl`. Editing an introduction or related resource link only requires changing the catalog. Restart the dev server or rebuild after changing data or configuration.

The GitHub button in the top-right corner always links to this website's source at <https://github.com/lexmount/browser-eval-site>.

Each benchmark has separate dataset and report links below its introduction,
stored as `datasetName`, `datasetUrl` and `reportUrl` in `benchmarks/catalog.json`.
Dataset links point to the official Hugging Face exports. Catalog reports are
related, independently updated pages and may cover a different run or sample
population. A result may supply its own `reportUrl` only when that report is
known to describe those results; otherwise it stays `null` and the page shows
the related catalog link. The result file's `source` records the provenance of
the displayed numbers; resource links do not replace it. `Download Report`
downloads the selected version's JSON with its definition references and provenance.

Tokens are only ever used outside this repository and are never stored in data, source or build output.
