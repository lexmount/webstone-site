# Browser Eval Leaderboard

The public leaderboard for our browser and search evaluation work. It presents browsers and search services side by side in sortable tables.

Four benchmark views are published on this site. The evaluation harness is [lexmount/browser-eval](https://github.com/lexmount/browser-eval).

## Benchmarks

### LexBench WebFetch

Live websites, from URL to usable content. Every browser handles the same 430 cases, split into six categories:

| Category | Cases | Pass criterion |
| --- | --- | --- |
| Static sites | 100 | Complete body text |
| Dynamic sites | 100 | JavaScript-rendered target content present |
| Popular sites | 100 | Body text, item count and link count meet the threshold |
| Anti-bot sites | 100 | Target page returned instead of a challenge page |
| Embedded documents | 10 | PDF and DOCX title and body recovered |
| Media | 20 | Valid image or video links (includes 3 direct media links) |

Each case has an end-to-end limit of 45 seconds and may be retried once on a temporary network error. Failures and timeouts count as failures. A successful request only means a response was received; it does not mean the task passed.

For every browser the site shows the request success rate, the task success rate, the number of passed cases out of 430, and the passed count for each of the six categories. Category counts add up to the published pass total and success rate.

### WebMainBench

Frozen HTML, same pages for every browser: 545 saved documents, scored on five dimensions (full text, code, formula, table content, table structure). The overall score is the mean of the five dimensions.

Browsers covered: Moli, Chromium, Lightpanda, Obscura and Kitesurf.

### LexBench WebSearch

149 scenario queries. The table compares Lexmount, Serper, Browserbase and Bright Data using nDCG@5, Precision@5 and Success@5.

### SimpleQA Verified

773 factual queries. The same four services are compared using Hit@5, MRR@5 and Answer Match@5. MRR remains on its original 0–1 scale.

The search results were transcribed from the user-provided overview image, with its SHA256 recorded in the result file. The average response times describe 980 calls across both query sets; they are shared measurements, not separate timings for either benchmark. Prices are USD per 1,000 calls. Timing and price columns sort from low to high by default; quality columns sort from high to low. The linked blog is a related report, not a verified version binding for the supplied image.

## Results

Condensed results live in `results/`, and `prepare:data` copies the files listed in `results/index.json` into `web/public/results/` for the app. Task sets, page corpora, the evaluation runner and raw logs are not part of this repository.

Pass counts come from the evaluation report or are summed from the six category counts. Values the source does not disclose are shown as `—`; a real zero is shown as `0.0`.

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

To add a result, place a condensed result file in `results/` and register it in `results/index.json`. `prepare:data` validates identity, provenance, values, category totals and paths, then copies only the declared files. Restart the dev server or rebuild after changing data.

The square GitHub button in the top-right corner links to <https://github.com/lexmount/browser-eval>. Set `NEXT_PUBLIC_GITHUB_URL` in `web/.env.local` to override it, then restart or rebuild. It is a public repository link, not a credential.

Tokens are only ever used outside this repository and are never stored in data, source or build output.
