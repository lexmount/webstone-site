# Submit public benchmark results

Results are pull requests in [lexmount/webstone-site](https://github.com/lexmount/webstone-site). Internal and external contributors use the same reviewed JSON contract. A GitHub account, Git and Node.js 22.13+ are sufficient; installing Webstone or Python is optional. There is no website account or upload database.

## Ask your agent

Use the [copyable instruction in the README](../README.md#for-agents). If your agent has no skill installer, copy the complete [SKILL.md](../.agents/skills/submit-webstone-result/SKILL.md) into its `submit-webstone-result/` skills directory and ask it to follow the file. Inspect an existing installation before replacing it.

## Direct PR workflow

```sh
gh auth status
git switch -c results/my-method
# Add a new JSON file under results/<benchmark>/ using the catalog and version guide.
# For a new method, add only its official HTTPS URL to catalog.providerUrls.
npm ci --ignore-scripts
npm test
npm run build
git add results/<benchmark>/<benchmark>-vX.Y.Z-report.json benchmarks/catalog.json
git commit -m "feat(results): add measured results for my method"
# Fork, push your feature branch to YOUR fork, then:
gh pr create --repo lexmount/webstone-site --base main --head YOUR_LOGIN:results/my-method
```

Replace placeholders and stage only paths actually changed. Use `gh repo fork lexmount/webstone-site --clone=false` and a separate contributor remote if needed; never replace an existing remote or push directly to upstream main. Inspect `git diff --cached` before committing. Include the source report, dataset/scorer identities, execution scope, timing and billing basis and known limitations in the PR body. A skill is guidance for the contributing agent; GitHub remains the submission protocol.

Read [Result versioning](result-versioning.md) and the current catalog before preparing a report. Add the next semantic result version, with matching filename, `id`, `version`, `release.previous`, UTC `release.date`, `release.kind` and English `release.summary`. First release: v1.0.0; new measurements under the same protocol: MINOR; metadata-only: PATCH; changed population/scoring: MAJOR. A new definition requires a separate definition PR first. Do not copy old scores into a new edition as placeholders.

Every new submission needs a public HTTPS `source.url`. Each file contains exactly one benchmark, an existing `definitionId`, `taskCount` (null if the source does not disclose the population), method configurations, scores and applicable sample/category counts. Missing metrics are `null`; genuine zeros stay zero. Keep units and independent denominators intact. `datasetDifference` explains the difference from the linked dataset in English. A result-specific `reportUrl` must describe that particular result. Preserve original evidence and quotations separately from display translations.

## Review and publication

CI uses the trusted base-branch validator to check immutable history, filenames, progression, references, bounds and denominators, then builds the website. Result PRs may add at most 20 regular JSON reports, each at most 1 MiB, and only required new participant URLs. Never overwrite/delete/rename published reports, change existing participant URLs or mix application/definition changes into a result PR.

Run `node scripts/check-result-change.mjs origin/main HEAD` after committing, with a freshly fetched `origin/main`. CI remains authoritative. Follow checks with `gh pr checks NUMBER --repo lexmount/webstone-site`; respond to evidence and configuration review. Passing CI checks consistency, not scientific truth. Maintainers decide when to merge. If another PR consumes your version, merge current upstream main into your contributor branch, allocate the next version again, preserve measurements, rerun checks and request review; never force-push.

After merge, verify the public site deployed the actual merge commit, then check the selected result version, report links and downloaded JSON on the live site. A merged PR does not prove deployment success. Corrections and rollbacks add a new explained edition; they do not modify history.

## Optional CLI / SDK

`webstone results template|validate|submit|status|rebase` automates this same PR workflow when Webstone is already installed. It is useful in an evaluation pipeline but is not a submission prerequisite. It does not bypass CI or maintainer review. See the [Webstone agent workflow](https://github.com/lexmount/webstone/blob/main/docs/agent-workflows.md) for installation and supported stages. Source-only instructions apply until the corresponding PyPI release is actually published.

## Public data and repository settings

Pending PRs are public too. Keep credentials, private raw logs, customer data and large evidence artifacts outside Git. Supply public evidence links instead. Reports must open without signing in; run `npm run check:reports` to check the page and any embedded preview. Use your contributor identity, never Rainbond's read-only deployment credential.

Keep PRs, required `Result submission contract`, `Website build`, `Anonymous report access` and `ocr-review` checks, conversation resolution and protection against direct/force pushes and deletion. Human approval counts are a maintainer setting; this repository currently does not require a separate human approval. A workflow or this document alone does not configure branch protection. PyPI software publication has its own protected environment and is independent of result submissions.
