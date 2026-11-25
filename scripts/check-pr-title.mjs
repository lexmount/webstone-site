import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateTitle(title) {
  if (typeof title !== "string" || title.length > 100 || /[^\x20-\x7e]/.test(title) || /[. ]$/.test(title) ||
      !/^(fix|feat|docs|refactor|test|perf|build|ci|chore)(\([a-z0-9][a-z0-9._/-]*\))?!?: [A-Za-z][\x20-\x7e]*$/.test(title)) {
    throw new Error("Use type(scope): English summary, with an optional scope, at most 100 characters and no final period. Types: fix, feat, docs, refactor, test, perf, build, ci, chore.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : null;
  const title = event?.pull_request?.title ?? event?.inputs?.title ?? process.argv[2];
  try { validateTitle(title); console.log("PR title follows the repository convention."); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
