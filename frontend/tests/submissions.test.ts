import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/features/studio/submissions";

test("CSV has one column per field and escapes quotes, commas and newlines", () => {
  const csv = toCsv([
    { id: 1, form_id: "c", form_type: "contact", page_id: null, status: "new", created_at: "2026-11-21T10:00:00",
      data: { name: { label: "Name", value: 'Ada "A", L' }, msg: { label: "Message", value: "line1\nline2" }, ok: { label: "Agree", value: true } } },
  ]);
  const [head, row] = csv.split("\r\n");
  assert.equal(head, '"Date","Form","Name","Message","Agree"');
  assert.ok(row.includes('"Ada ""A"", L"') && row.includes('"line1\nline2"') && row.endsWith('"Yes"'));
});
