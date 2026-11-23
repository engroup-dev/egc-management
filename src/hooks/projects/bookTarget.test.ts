import { test } from "node:test";
import assert from "node:assert/strict";
import { bookTargetProject } from "./bookTarget";

test("returns the project when the form and the page agree", () => {
  assert.equal(bookTargetProject("p1", "p1"), "p1");
});

test("refuses a form left over from another project", () => {
  // The 2026-11 strays: the page showed one project while the form still
  // carried the previous one, so the expense landed in the wrong project.
  assert.throws(() => bookTargetProject("page-project", "previous-project"), /مشروع/);
});

test("refuses a missing project on either side", () => {
  assert.throws(() => bookTargetProject("p1", undefined));
  assert.throws(() => bookTargetProject("p1", ""));
  assert.throws(() => bookTargetProject("", "p1"));
});
