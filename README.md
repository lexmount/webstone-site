# Webstone Site

<img src="web/public/brand/webstone.png" alt="Webstone logo" width="240">

[![Leaderboard](https://img.shields.io/badge/Leaderboard-webstone.lexmount.io-527e68)](https://webstone.lexmount.io) [![Datasets](https://img.shields.io/badge/%F0%9F%A4%97-Datasets-ffd21e)](https://huggingface.co/Lexmount)

The website for [Webstone](https://github.com/lexmount/webstone), the touchstone for your agent’s web browsing. Use the [leaderboard](https://webstone.lexmount.io) to compare methods and read published evaluation reports. It covers sixteen benchmark views across five Tracks and links to the independently hosted BrowserArena.

Run evaluations with [Webstone](https://github.com/lexmount/webstone); submit measured results and public evidence to this repository.

## Run evaluations or submit results

| Task | Repository |
| --- | --- |
| Choose a Track and benchmark, prepare the environment, run inference, score results and generate a report | [lexmount/webstone](https://github.com/lexmount/webstone#for-agents) |
| Submit measured results and public evidence through a PR, then display them on the leaderboard | [lexmount/webstone-site](https://github.com/lexmount/webstone-site#for-agents) |

For a new evaluation, copy the prompt in the [Webstone README](https://github.com/lexmount/webstone#for-agents) to install its evaluation skill. After the run, that skill can hand result submission to this repository's submission skill.

## For agents

Copy this into your agent:

```text
Install and use the submission skill at https://github.com/lexmount/webstone-site/blob/main/.agents/skills/submit-webstone-result/SKILL.md to submit [my measured results and public evidence] as a PR to lexmount/webstone-site.
```

See the [PR guide](docs/submitting-results.md) for versioning and validation. GitHub, Git and Node.js are sufficient.

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

149 scenario queries. Latest results compare nine methods at L1 (titles and primary snippets), four at L2 (supplemental excerpts) and one at L3 (generated answers). Each layer has an independent scoring input and candidate pool. L1/L2 rank by nDCG@5 × 100; L3 reports answer usefulness and citation support.

### LexBench SimpleQA Verified

Latest quality results use 773 valid factual queries out of 831 collected questions; 58 with defective references are excluded. Timing retains all 831 factual calls. L1 ranks by MRR@5 on its 0–1 scale; L2 ranks by excerpt answer-text matching; L3 reports official SimpleQA answer accuracy. These are separate views, not interchangeable scores. Historical v1 remains available with its original definition and numbers.

### LexBench Headless Browser

A 372-task subset of the historical [Lexbench Headless Browser](https://github.com/lexmount/Lexbench-Headless-Browser) protocol, published against the linked Hugging Face export. Seven Moli builds are compared with layout on and off on task success rate, the change in percentage points against the baseline, peak PSS memory and mean latency per task, each paired with its relative change against the baseline. The baseline row measures one task directly and inherits the remaining 371 from shared failure relations; every other row measures all 372 tasks, sampled three times.

### LexBench WebArena Replay

812 end-to-end replay tasks derived from [ServiceNow/webarena-verified](https://github.com/ServiceNow/webarena-verified). Six execution setups (Chromium 153, Moli at #731 + #853, Moli v1.1.11, Lightpanda nightly 9813, Obscura 0.2.3 and Kitesurf on Cloudflare Browser Run) are compared on task success rate, end-to-end task latency and per-action latency. Task latency uses all 812 tasks per setup; action latency is measured per action, so its sample count differs by setup. Both latencies report mean, P50 and P95, and lower is better.

### LexBench SWDE

The Web Extract Track compares ten hosted API and open-source / DeepSeek methods on 800 archived SWDE pages. The single table includes page-hit macro F1, value micro F1, field-set exact match, full-page exact match, null handling, execution and returned-field counts, timing coverage, mean / P50 / P95 elapsed time and USD per 1,000 calls. Page-hit macro F1 is the default ranking metric.

Full-page exact match uses 740 eligible pages: 60 pages are excluded because reference coverage is incomplete. Null handling uses 25 empty reference fields across 24 pages. Numerators and denominators remain available in cell details and downloads. Every method executed 800 of 800 pages and has 800 timing records, with none missing.

The numbers come from the two user-supplied tables. The linked Dataset contains inputs only; the correspondence to a particular revision and its scoring references is unverified. Pricing ranges and billing conditions are preserved as supplied, not checked against current plans. Ranges are not ranked or reduced to a single price. Open-source software costs $0, with DeepSeek token usage additional and the total undisclosed. Per-method interpretation and official billing-source URLs were not supplied, so no such links are fabricated.

### LexBench Zyte Product Extraction

The Web Extract Track also compares twelve methods on 140 archived product pages. Full-page exact match is the default ranking metric. Other columns cover tested pages, returned objects, price / SKU / stock / out-of-stock F1, null handling, timing coverage, mean / P50 / P95 elapsed time and USD per 1,000 calls.

The supplied reference distributions are 134 nonempty prices / 6 empty, 135 nonempty SKUs / 5 empty, and 131 in-stock / 9 out-of-stock pages. These version-specific populations appear in the metric explanations via `metricSamples.note`; the reusable metric definitions stay in the catalog. Full-page exact match uses all 140 pages, while null handling uses 6. All twelve methods have 140 timing records and no missing timings.

The supplied distributions match the Dataset's original-reference counts, rather than its separately provided source-qualified annotation view. The exact evaluated revision and page hashes remain unverified. Prices and billing conditions are transcribed from the supplied table, with unknown model costs retained as unknown. This benchmark reuses the SWDE table without another renderer or dependency.

### Browser Use

The Browser Use Track under Browser Automation compares browser agents on four benchmarks:

- **BU Bench v1** ([browser-use/benchmark](https://github.com/browser-use/benchmark)): multi-site research, cross-checking and interactive web controls.
- **Online-Mind2Web** ([osunlp/Online-Mind2Web](https://huggingface.co/datasets/osunlp/Online-Mind2Web)): end-to-end tasks across live websites.
- **WebVoyager** ([MinorJerry/WebVoyager](https://github.com/MinorJerry/WebVoyager)): tasks across 13 major live websites.
- **OSWorld** ([xlang-ai/OSWorld](https://github.com/xlang-ai/OSWorld)): 75 tasks focused on browser and local-file handling.

BU Bench v1, Online-Mind2Web and WebVoyager report success rates on evaluable tasks, excluding tasks blocked by website access denials. Peer results are taken from each project's official public report, and per-task model costs remain undisclosed where not published.

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

Historical search v1 results were transcribed from the user-provided overview image, with its SHA256 recorded in the result file. The average response times describe 980 calls across both query sets; they are shared measurements, not separate timings for either benchmark. Prices are USD per 1,000 calls. Timing and price columns sort from low to high by default; quality columns sort from high to low. The linked blog is a related report, not a verified version binding for the supplied image.

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

Each Benchmark has its own semantic result versions, ordered numerically by major, minor and patch. Historical `vN` files appear as `vN.0.0` and keep their original URLs.

Web Fetch publishes the `split-media` definition. A changed metric calculation, category meaning or pass criterion needs a new definition ID; retain old definitions so old results keep their original meaning. Sample counts belong to the published result, not the reusable definition.

`prepare:data` scans the Benchmark directories, publishes the catalog to `web/public/benchmarks/`, copies the reports into `web/public/results/`, and generates a `reports.json` data bundle for the page. This is generated output, never a source file to maintain. Removed source files are removed from generated output on the next preparation. The page defaults to each Benchmark's latest version, joins results with their exact definitions in memory, and downloads the individual version report without page metadata. Task sets, page corpora, the evaluation runner and raw logs are not part of this repository.

Pass counts come from the evaluation report or are summed from its category counts. Values the source does not disclose are shown as `—`; a real zero remains zero.

Optional provider `counts` records a metric's numerator and denominator, validated against its numeric score and any declared sample count. Optional `pricing` records the supplied per-1,000-call `min` / `max` range, an `approximate` flag and English billing `description`; undisclosed totals use null bounds, with `softwareCost` recording a known software-only charge. These are version-specific measurements, not catalog metadata.

## Table behavior

The default ranking metric is the first numeric column after the provider. Task success leads Web Fetch, Overall leads WebMainBench, nDCG@5 leads Web Search, MRR@5 leads the latest SimpleQA Verified L1 (historical v1 uses Hit@5), and task success leads both agent benchmarks. Clicking another header sorts by it without moving the column.

Each definition selects its Key metrics: the quality measures needed to understand the benchmark, at most one representative timing, and useful reported resource or cost measures. More metrics adds the remaining disclosed measurements. Category breakdown is open by default.

Each comparable column highlights its best value using the metric direction. Ties are all highlighted; missing values and columns with fewer than two distinct disclosed values have no winner. Incomparable timings and price quotes do not declare a winner; diagnostic editions show neither ranks nor winners. The sorted header is highlighted separately.

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

## Deployment

### Cloudflare Pages

The public site uses Cloudflare Pages. Merge into `main`, then push a new `vMAJOR.MINOR.PATCH` tag to run tests, check report access and publish the static export. Main pushes alone do not publish. See [Pages deployment](docs/deploying-pages.md) for initial authorization, GitHub settings, domain configuration, verification and manual recovery.

Report links must open without signing in. `npm run check:reports` makes anonymous HTTPS requests through each share page, delivery manifest and required report file, including embedded reports. Private or missing files and redirects to sign-in block publication. CI runs the check on PRs, main updates and daily. Report updates can keep the same public link; the check does not lock file versions or score report content. Open the report in a signed-out browser when adding a link. Review its measurements separately from link availability.

The export includes Pages cache headers and the submission redirect. Verify the deployed release, leaderboard data and report downloads before retiring a previous host.

### Docker and optional Rainbond hosting

The root `Dockerfile` installs locked dependencies with Node.js 22, runs tests, regenerates the bundled results and exports the static site. The final Nginx image serves only the exported files on HTTP port `8080` using `deploy/nginx.conf`. Generated local build files and environment files are excluded by `.dockerignore`.

To build and preview locally with Docker:

```sh
docker build -t webstone-site:local .
docker run --rm -p 8080:8080 webstone-site:local
```

Open <http://127.0.0.1:8080>.

For optional Rainbond deployment directly from GitHub:

1. Commit and push the latest code, catalog, result files and these deployment files to the branch Rainbond will build. With a protected `main`, merge the pull request first.
2. In the target Rainbond application, create a component from source code using `https://github.com/lexmount/webstone-site.git` and the published branch, normally `main`. A private repository needs GitHub repository-read authorization configured in Rainbond.
3. Select Dockerfile as the build method. Use the repository root (`.`) as the build context and the root `Dockerfile` as the Dockerfile path. Do not use `web/` as the build context: workspace packages, the lockfile, catalog, reports and preparation script live at the root.
4. Use HTTP port `8080`, enable external access and leave the start command at the image default. No runtime environment variables, database or persistent storage are required.
5. Build and deploy, then open the component URL and verify the leaderboard and report downloads. An existing component created from an image must have its build source switched to Git source if that option is available; otherwise create a new source component, verify it, and move the domain route before removing the old component.

This path uses Rainbond's own Dockerfile builder and image storage. Gitea, GitHub Actions and an external image registry are not required. `rainbond.app.json` declares `main` as the source branch. It is a deployment descriptor, not evidence of the running component's settings, and changing it does not update an existing Rainbond component automatically.

To deploy on every update to `main`, the running component must build this repository's `main` branch with the root Dockerfile, and its GitHub push webhook and automatic build/deploy settings must be enabled. Verify the webhook delivery and the deployed commit after a merge. This optional Rainbond path does not use the Cloudflare Pages release workflow. A manual or local-package component will not pick up GitHub changes automatically.

Configure the running component to fetch the official GitHub repository from `main`, enable automatic builds and disable keyword filtering if every main update should trigger a build. A private repository also requires a repository-read credential in Rainbond's protected source settings. Rainbond workspace membership and GitHub repository access are separate permissions; do not route private repository credentials through a public download proxy. Verify build logs and the active code version after each release: a successful webhook delivery alone is not proof of a completed deployment.

### Cache behavior

`deploy/nginx.conf` sends `Cache-Control: no-store, max-age=0` for HTML, catalogs and reports. Fingerprinted files under `/_next/static/` use a one-year immutable cache. This policy is included by the Dockerfile; a local-package deployment does not automatically use this Nginx configuration. Any ingress or CDN must preserve these response headers.

Previously cached HTML may remain usable until the browser contacts the server again. A current client requests `/cache-reset` once per browser to evict HTTP-cache entries from before the no-store policy. The endpoint sends only `Clear-Site-Data: "cache"`; cookies, language preferences and other storage remain intact. Successful migration is recorded locally, so later visits do not repeatedly clear fingerprinted assets. Network or storage failures leave normal release checks usable and migration retryable on a later load. A page that predates the client still needs one initial refresh; server headers cannot change code that has not contacted the server. Any intermediate HTML cache must also be purged separately.

`prepare:data` fingerprints page source, catalog and published results into a generated `release.json` and a compiled release constant. A visible page checks that manifest on mount, focus, history restoration and once per minute. A different release triggers one reload per release per tab; invalid or unavailable manifests leave the current page usable. This covers already-open pages, which HTTP response headers alone cannot update. A page predating this mechanism must first load the new client once. The manifest and data requests bypass HTTP caches; ingress/CDN caches must preserve the no-store policy.

CI serves the actual static export through this Nginx configuration and checks entry-page and data cache headers, immutable stylesheet headers, deep links and the cache-reset response. A source-code assertion alone does not verify deployed response headers.

## Languages and selected insights

English is the first-visit default. An explicit EN / 中文 selection persists locally and updates document language. The catalog owns translations of reusable names, descriptions and metric definitions; each report owns translations of its version-specific scope and notes. Original source quotations and provenance are preserved, including historical non-English notes with a separate English display translation.

Every benchmark uses the shared table and metric selectors. A capability profile appears when at least three meaningful axes are available. Users choose visible columns, radar axes and methods to compare. Missing measurements stay missing; quoted prices are separate from measured costs and stay outside the radar. Reports appear below the capability profile and on the homepage.

### BrowserArena

The catalog's `browserarena` Track links to <https://browserarena.ai/> in a new tab. Its lifecycle, proxy, throughput and CAPTCHA views retain their own navigation and history. An external Track has a verified HTTPS `url` and no local benchmark definitions or result files. It is a regular hyperlink; no filesystem symlink, iframe or proxy is involved.

### Public repository scope

Published reports, their source/evidence fields and all linked reports are public-facing material. The current data includes transcribed tables and images, unpinned dataset correspondence, undisclosed execution details and quoted pricing. Preserve these limitations; the published tables do not establish full run reproducibility. Raw evaluation logs and datasets are not included here.

The website software uses Apache License 2.0, matching Webstone; see `LICENSE` and `NOTICE`. This does not relicense third-party datasets, trademarks or externally linked reports. The deployment descriptor uses placeholder environment names; keep credentials and webhook URLs in protected platform settings, never in tracked files.

See the official [Dockerfile deployment guide](https://www.rainbond.com/docs/how-to-guides/app-deploy/source-code/dockefile).

## Validation and updates

Before changing the site, read the [website specification](docs/spec.md) and the
[field-level contracts](AGENTS.md). Use the [review guide](docs/references/review-guidelines.md)
to choose checks for the affected data, table, navigation or publication behavior.
Result contributors also follow the [submission guide](docs/submitting-results.md).

```sh
npm test
npm run prepare:data
```

To add a version for an existing definition:

1. Add `results/<id>/<id>-vX.Y.Z-report.json`. Use the next version under the [result versioning rules](docs/result-versioning.md) and include its `release` metadata. Reference the existing Benchmark and definition, match the top-level `id` and `version` to the filename, and describe the dataset difference in English. Record measured results and public evidence. Keep `null` for undisclosed values.
2. Run `npm test` and `npm run build`, or restart `npm run dev` for local browsing. No index, catalog or website edits are needed for a new version using an existing definition. With dev already running, `npm run prepare:data` followed by a page refresh also picks up new files.

Discovery runs at startup/build time so the site stays fully static. `prepare:data` rejects invalid versions, filename/Benchmark/version mismatches, nested directories, symbolic links, duplicate result IDs, non-English or missing `datasetDifference`, and invalid measurements. The same Benchmark/version has one fixed filename. A public deployment must be rebuilt and redeployed to publish new files.

For a new Benchmark or evaluation definition, add its metadata to `benchmarks/catalog.json` first, including `datasetName` matching the final segment of `datasetUrl`. Editing an introduction or related resource link only requires changing the catalog. Restart the dev server or rebuild after changing data or configuration.

Language controls and the GitHub link sit at the bottom of the navigation, including the mobile menu. The GitHub link always points to this website's source at <https://github.com/lexmount/webstone-site>.

Each benchmark has separate dataset and report links below its introduction,
stored as `datasetName`, `datasetUrl` and `reportUrl` in `benchmarks/catalog.json`.
Dataset links point to the official Hugging Face exports. Catalog reports are
related, independently updated pages and may cover a different run or sample
population. A result may supply its own `reportUrl` only when that report is
known to describe those results; otherwise it stays `null`. The shared Track link is always visible; a supplied
version-specific report is shown as a separate Version report. The result file's `source` records the provenance of
the displayed numbers; resource links do not replace it. `Download Report`
downloads the selected version's JSON with its definition references and provenance.

Tokens are only ever used outside this repository and are never stored in data, source or build output.

## Reviewed result submissions

Use the [submission skill](.agents/skills/submit-webstone-result/SKILL.md) and [PR guide](docs/submitting-results.md). An agent prepares public measured JSON and opens a fork PR; Git, GitHub and Node.js are sufficient. Webstone CLI/SDK helpers are optional. Published results are immutable and corrections add a new edition. CI validates the contract; maintainers control merging and publication. See [Webstone](https://github.com/lexmount/webstone) for the broader evaluation, report and dataset workflow.

New result editions record a UTC release date. The website shows its own update time separately. See [Result versioning](docs/result-versioning.md).
