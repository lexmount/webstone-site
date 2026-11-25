import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { validateTitle } from "./check-pr-title.mjs";

test("accepts the documented types, optional scopes and breaking markers", () => {
  for (const type of ["fix", "feat", "docs", "refactor", "test", "perf", "build", "ci", "chore"]) {
    for (const title of [`${type}: update shared behavior`, `${type}: x`, `${type}(web-fetch): update shared behavior`, `${type}!: update shared behavior`, `${type}(api)!: update shared behavior`]) assert.doesNotThrow(() => validateTitle(title));
  }
});
test("rejects unstructured titles, unsupported types and ambiguous multiline subjects", () => {
  for (const title of [undefined, "", "Improve track-specific report readability", "Fix: change a behavior", "feature: add a provider", "fix: ", "fix: update behavior.", "fix: update behavior ", " fix: update behavior", "fix: update\nbehavior", "fix: 更新结果", "fix(): update behavior", "fix: " + "x".repeat(100)]) assert.throws(() => validateTitle(title));
});
test("the command returns a failure for an invalid proposed title", () => {
  const command = new URL("./check-pr-title.mjs", import.meta.url);
  for (const [title, status] of [["fix(ui): align benchmark cards", 0], ["Improve benchmark cards", 1]]) {
    const result = spawnSync(process.execPath, [command.pathname, title], { env: { ...process.env, GITHUB_EVENT_PATH: "" }, encoding: "utf8" });
    assert.equal(result.status, status, result.stderr);
  }
});
