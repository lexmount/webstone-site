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

Published numeric results retain sorting, per-column ranks, directional highlights
and quality charts. Source annotations identify author evaluations, official blogs,
papers and other publications; they do not control whether these features exist.
`comparisonMode: "reported"` uses Highest/Lowest reported value wording. Numeric
order describes the supplied values and does not certify a shared evaluation
protocol. An explicitly diagnostic `rankable: false` edition has no ranks or
extremum highlights. Descriptive metrics use neutral Highest/Lowest value wording.

For numeric metrics, the declared direction determines ranks and winners;
reversing display order changes neither. Ties share competition ranks. Constant or
insufficiently disclosed columns have no winner. Use neutral labels for `highlightBest: false`.
Output length remains a descriptive measurement. Price ranges and unknown model
charges never become exact totals.

Keep one measured configuration per browser product in a standard public cohort,
with its actual version identifiable. Temporary PR builds are not separate
products. Headless build/layout comparisons and distinct commercial tiers follow
their declared purposes; see the cohort rules in [AGENTS.md](../AGENTS.md).

## Reading the leaderboard

Every Benchmark and Overview uses `web/components/results-table.tsx`.
`web/lib/table-comparison.ts` owns ordering, missing values, competition ranks and
per-column winners. Adapters supply columns, source values and method details;
they do not copy table markup or ranking logic. Ranks use the declared direction and stay unchanged when display order is reversed.
Source-reported metrics retain the rank column.

Each benchmark has one shared table. Its definition declares Key metrics in order:
primary quality first, other essential quality measures, useful reported resources or
cost, and at most one representative timing. More metrics adds supplemental
measurements; it must not hide the benchmark's essential quality dimensions.
Categories start expanded. Both views use the same formatting and winner rules.

Table width follows its content within the available space. Numeric columns stay
equal and capped; extra viewport width must not stretch a score column across the
page. Narrow screens scroll the table while keeping rank and method visible.
Method names remain readable. [AGENTS.md](../AGENTS.md#rendering-rules) owns exact geometry.

A capability profile must reveal several meaningful dimensions. Do not construct
one from redundant timing percentiles or incomparable costs to fill three axes.
Preserve absent values and label scales. Readers can select methods and axes.
Use a horizontal comparison when only one or two dimensions are available.

All local Tracks offer a Track Overview before their
benchmark tabs. It compares current published results across the constituent
benchmarks without becoming a new benchmark or inventing an overall score.
Retain all methods and missing cells. The global method registry aligns browser
releases while showing the tested configuration beside each result;
service and model variants remain distinct. Table cells link to their exact
benchmark editions. Every constituent benchmark stays visible, including an empty
one. Show method coverage and offer a complete-coverage filter. Sort by the first
primary score with missing values last. Rank the selected benchmark column without a combined rank. Default charts retain every published primary metric separately by benchmark; the optional multi-benchmark
radar admits only complete profiles. Search overviews retain the L1/L2/L3 distinction.
Method details show the method ID, product ID, tested configurations and current
published results. A shared URL never establishes method equivalence.

Keep auxiliary sidebar resources behind a compact footer menu beside the language
switch, opening above it. The footer has no separate GitHub Star link; evaluation
and submission links already lead to the repositories. Track cards share a compact
two-row viewport for wrapping benchmark chips, with scrolling and a mobile expand
action.
Feedback links open GitHub Issues; publish an email address only after its owner
has designated and verified a public contact address. Keep the Star invitation
brief and link it to the evaluation repository.
Report pages contain two rows at the actual grid column count; resize and filtering
clamp the selected page without omitting reports. Chart method selectors
have bounded height, search and select/clear controls. On wide screens keep them
beside a bounded chart grid, without an empty grid column or detached legend. Favicons use a transparent
stone cutout without the logo's white page background.

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
Put denominators and pass criteria in metric details and concise evaluation scopes.
Keep execution notes and review history in downloadable provenance. Do not generate
generic warning badges from ranking flags or append raw notes to public tooltips.

English and Chinese communicate the same meaning naturally; one need not copy the
other's sentence structure. Preserve official names and original evidence. Follow
the bilingual editorial workflow in [AGENTS.md](../AGENTS.md#website-copy).

Keep **Find the right tools for your agent to browse the web.** as the homepage's
only descriptive slogan. Keep the hero compact with content-driven height, moderate
padding and no second sentence repeating the benefit. The site and evaluation repo
share the official Webstone logo asset. The image contains the Find sentence only;
README prose uses the complete “The touchstone for your agent’s web browsing.”
line and omits the Find sentence already present in the image. Their READMEs
explain their respective roles; the site's README must not read like the evaluation tool's installation page.
Use the stone symbol for the favicon, and the Hugging Face identity for datasets.

Source annotations identify the publisher and source type for the exact result
edition. Show a short label beside the method and original links in its dialog,
including results reached from Overview. Distinguish the report author's own
evaluation, official blogs, papers, public code/results, model cards and trajectory
archives. These labels describe provenance; they do not certify reproducibility.
The current Browser Use tables retain their author-compiled scores, numeric ranks
and quality charts with source labels. They do not calculate an overall score.

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
