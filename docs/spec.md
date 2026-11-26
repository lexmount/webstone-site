# Website specification

Webstone Site helps readers find the right tools for their agent to browse the
web. It publishes comparisons of web tools, browsers and browser agents. It is a
public results website: a reader needs no account, token or evaluation environment.

This specification defines product and architecture requirements. [AGENTS.md](../AGENTS.md)
owns field-level contracts and contributor instructions. The [review guide](references/review-guidelines.md)
turns these requirements into checks. Change the document that owns a rule;
link to it from other guides instead of maintaining several versions.

## Ownership and change boundaries

| Owner | Responsibility |
| --- | --- |
| [Webstone](https://github.com/lexmount/webstone) | Execute tasks, score evidence and produce evaluation reports. Its own spec governs its pipelines. |
| Hugging Face datasets | Published task inputs, references and benchmark definitions at their declared revisions. |
| `benchmarks/catalog.json` | Reusable names, introductions, definitions, metric presentation, example tasks, resource links and translations. |
| `results/` | Immutable published measurements, actual populations, method configurations and provenance. [Result versioning](result-versioning.md) owns edition changes. |
| Website code | Validate and render results, select versions, sort, format and navigate. It does not rerun tasks or rescore evidence. |
| Linked report host | Serve the finished report at its public share link. Report access and report correctness are separate checks. |

The build validates source data before generating the static export. Generated
files under `web/public/benchmarks/`, `web/public/results/` and `web/out/` are not
editable authorities. There is no result database or server-side upload API.

Add a benchmark through catalog definitions and result files. Extend the shared
renderer only when metadata cannot express a reusable behavior; do not copy a
table or chart for one benchmark. Keep scoring out of presentation code and keep
the dependency surface small.

## Measurements and comparison

Every displayed number must trace to the selected result's evidence. Preserve its
definition, population, independent metric denominators and measured method
configuration. Dataset and related report links provide navigation; they do not
prove that every displayed edition used those exact inputs or measurements.

Missing values remain missing; zero remains zero. Formatting may show a ratio as
a percentage or milliseconds as seconds, but must preserve the underlying value
and precision. Counts, scores, memory and signed deltas keep their proper units.
Downloads retain original values, numerators and denominators.

Rank and highlight only comparable values. `direction` identifies the best value;
the active sort direction does not change it. Ties share highlights. Constant or
insufficiently disclosed columns have no winner. Respect `highlightBest: false`
and diagnostic `rankable: false` in tables and charts: neither inconsistent test
conditions nor different billing bases become comparable because values are numeric.
Output length is descriptive, not a quality score. Never turn a price range or
unknown model charge into an exact total.

Keep one measured configuration per browser product in a standard public cohort,
with its actual version identifiable. Temporary PR builds are not separate
products. Headless build/layout comparisons and distinct commercial tiers follow
their declared purposes; see the cohort rules in [AGENTS.md](../AGENTS.md).

## Reading the leaderboard

Each benchmark has one shared table. Its definition declares Key metrics in order:
primary quality first, other essential quality measures, useful reported resources or
cost, and at most one representative timing. More metrics adds supplemental
measurements; it must not hide the benchmark's essential quality dimensions.
Categories start expanded. Both views use the same formatting and winner rules.

Table width follows its content within the available space. Numeric columns stay
equal and capped; extra viewport width must not stretch a score column across the
page. Narrow screens scroll the table while keeping rank and method visible.
Method names remain readable. [AGENTS.md](../AGENTS.md#rendering-rules) owns exact geometry.

Use a paired plot for one quality metric and one comparable resource metric;
keep undisclosed resource values on a separate rail. Use a radar for three or
more meaningful dimensions. Do not fill it with redundant timing percentiles or
incomparable costs.
Preserve absent values and label scales. Readers can select methods and axes.

Selecting a benchmark or layer starts its content at the top. Version and metric
links must identify the intended edition and sorting metric. A missing edition
shows an empty state and an explicit route to the latest result. Downloads always
match the selected edition, including historical links.

Track and benchmark example dialogs explain input, execution and output using a
traceable dataset task. A reference answer or relevant page is labeled as such.
An actual method response must identify the method and its recorded source;
never present an invented or expected response as a measured output. Fixed action
replay means executing the supplied sequence; it does not imply an agent made
fresh decisions.

## Copy, identity and reports

Write for someone arriving without the development conversation. Keep the visible
page concise: one title, one method/case summary and the facts needed to compare.
Put denominators, execution conditions and provenance in their relevant details;
keep a material comparability status visible. Do not add editing history, task
notes or repeated generic explanations to the public page.

English and Chinese communicate the same meaning naturally; one need not copy the
other's sentence structure. Preserve official names and original evidence. Follow
the bilingual editorial workflow in [AGENTS.md](../AGENTS.md#website-copy).

Keep both parts of the positioning: **Find the right tools for your agent to
browse the web.** and **The touchstone for your agent's web browsing.** The first
states the benefit; the second explains the name. The site and evaluation repo
share the official Webstone logo asset. Their READMEs explain their respective
roles; the site's README must not read like the evaluation tool's installation page.
Use the stone symbol for the favicon, and the Hugging Face identity for datasets.

An existing published report is an authored publication. Preserve its framework,
illustrations and narrative when correcting facts or adding a necessary detail.
Do not replace it with a rewrite or revision notebook. A requested restoration
uses the named saved version. Restricted original reports may be recorded only
in repository-only source notes; they must not enter the public export, public
report body or public evidence checks. Public share links must work anonymously;
keep restricted originals within their authorized audience.

## Contribution and delivery

Keep the reviewed submission route available to internal and external contributors;
follow [submitting results](submitting-results.md). A submitted file is not trusted
merely because it follows the schema or was produced by Webstone. Verify its
evidence and methodology before approval.

Use a feature branch and reviewable PR. Tests and builds authorize neither merging
nor publication. Obtain the owner's authorization for that work before merging,
and a release request before publishing. Keep credentials out of output and Git.

Follow [deployment instructions](deploying-pages.md) for release identity, cache
headers and recovery. A successful upload is not delivery: open the deployed
domain and verify the changed flows, data and selected-edition downloads. A host
change must retain deep links, report access and cache behavior before retiring
the previous host.
