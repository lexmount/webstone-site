# Browser Eval Leaderboard

The public leaderboard for our browser, search and structured extraction evaluation work. It presents methods side by side in sortable tables.

Eight benchmark views across four Tracks are published on this site. The evaluation harness is [lexmount/browser-eval](https://github.com/lexmount/browser-eval).

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

### LexBench SWDE

The Web Extract Track compares ten hosted API and open-source / DeepSeek methods on 800 archived SWDE pages. The single table includes page-hit macro F1, value micro F1, field-set exact match, full-page exact match, null handling, execution and returned-field counts, timing coverage, mean / P50 / P95 elapsed time and USD per 1,000 calls. Page-hit macro F1 is the default ranking metric.

Full-page exact match uses 740 eligible pages: 60 pages are excluded because reference coverage is incomplete. Null handling uses 25 pages. Both show the supplied numerator, denominator and percentage. Every method executed 800 of 800 pages and has 800 timing records, with none missing.

The numbers come from the two user-supplied tables. The linked Dataset contains inputs only; the correspondence to a particular revision and its scoring references is unverified. Pricing ranges and billing conditions are preserved as supplied, not checked against current plans. Ranges are not ranked or reduced to a single price. Open-source software costs $0, with DeepSeek token usage additional and the total undisclosed. Per-method interpretation and official billing-source URLs were not supplied, so no such links are fabricated.

### LexBench Zyte Product Extraction

The Web Extract Track also compares twelve methods on 140 archived product pages. Full-page exact match is the default ranking metric. Other columns cover tested pages, returned objects, price / SKU / stock / out-of-stock F1, null handling, timing coverage, mean / P50 / P95 elapsed time and USD per 1,000 calls.

The supplied reference distributions are 134 nonempty prices / 6 empty, 135 nonempty SKUs / 5 empty, and 131 in-stock / 9 out-of-stock pages. These version-specific populations appear in the metric explanations via `metricSamples.note`; the reusable metric definitions stay in the catalog. Full-page exact match uses all 140 pages, while null handling uses 6. All twelve methods have 140 timing records and no missing timings.

The supplied distributions match the Dataset's original-reference counts, rather than its separately provided source-qualified annotation view. The exact evaluated revision and page hashes remain unverified. Prices and billing conditions are transcribed from the supplied table, with unknown model costs retained as unknown. This benchmark reuses the SWDE table without another renderer or dependency.

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
| LexBench SWDE | [LexBench-SWDE](https://huggingface.co/datasets/Lexmount/LexBench-SWDE) |
| LexBench Zyte Product Extraction | [LexBench-Zyte-Product-Extraction](https://huggingface.co/datasets/Lexmount/LexBench-Zyte-Product-Extraction) |

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

Optional provider `counts` records a metric's numerator and denominator, validated against its numeric score and any declared sample count. Optional `pricing` records the supplied per-1,000-call `min` / `max` range, an `approximate` flag and English billing `description`; undisclosed totals use null bounds, with `softwareCost` recording a known software-only charge. These are version-specific measurements, not catalog metadata.

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

## Local static-package deployment

The local Rainbond binding deploys an uploaded static package without fetching GitHub. `rainbond.app.json` records the package component; `.rainbond/local.json` and `.rainbond/staging/` stay git-ignored. Build the current local files and refresh the staging directory before each deployment:

```sh
npm run build
mkdir -p .rainbond/staging/web/static-package
rm -rf .rainbond/staging/web/static-package/dist
cp -R web/out .rainbond/staging/web/static-package/dist
```

Use the official Rainbond local-package helper and protected upload command to package `.rainbond/staging/web/static-package`. The ZIP must contain `dist/index.html`, the exported assets and result files. Rainbond serves these files with Nginx on HTTP port 8080. Set runtime resources to 1 CPU core (1000m) and 128MB memory. No Node.js process runs in the deployed component. Local dependencies, Git metadata and credentials are excluded. Future updates require another build, upload and manual deployment.

## Docker and manual Rainbond deployment

The root `Dockerfile` installs locked dependencies with Node.js 22, runs tests, regenerates the bundled results and exports the static site. The final Nginx image serves only the exported files on HTTP port `8080` using `deploy/nginx.conf`. Generated local build files and environment files are excluded by `.dockerignore`.

To build and preview locally with Docker:

```sh
docker build -t browser-eval-site:local .
docker run --rm -p 8080:8080 browser-eval-site:local
```

Open <http://127.0.0.1:8080>.

For manual Rainbond deployment directly from GitHub:

1. Commit and push the latest code, catalog, result files and these deployment files to the branch Rainbond will build. With a protected `main`, merge the pull request first.
2. In the target Rainbond application, create a component from source code using `https://github.com/lexmount/browser-eval-site.git` and the published branch, normally `main`. A private repository needs GitHub repository-read authorization configured in Rainbond.
3. Select Dockerfile as the build method. Use the repository root (`.`) as the build context and the root `Dockerfile` as the Dockerfile path. Do not use `web/` as the build context: workspace packages, the lockfile, catalog, reports and preparation script live at the root.
4. Use HTTP port `8080`, enable external access and leave the start command at the image default. No runtime environment variables, database or persistent storage are required.
5. Build and deploy, then open the component URL and verify the leaderboard and report downloads. An existing component created from an image must have its build source switched to Git source if that option is available; otherwise create a new source component, verify it, and move the domain route before removing the old component.

This path uses Rainbond's own Dockerfile builder and image storage. Gitea, GitHub Actions and an external image registry are not required. Later updates need another build from the updated GitHub branch; automatic deployment only applies after configuring it separately.

See the official [Dockerfile deployment guide](https://www.rainbond.com/docs/how-to-guides/app-deploy/source-code/dockefile).

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
