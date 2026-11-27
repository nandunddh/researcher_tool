import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGE_SIZES, PAPERS, fit, fromCsv, fromRegistrations, fromSpeakers, parseCsv, randomCode, sheets } from "../src/features/badges/badges";

const size = (id: string) => BADGE_SIZES.find(s => s.id === id)!;
const paper = (id: string) => PAPERS.find(p => p.id === id)!;

test("the number of badges per sheet matches the real paper sizes", () => {
  assert.deepEqual(fit(paper("a4"), size("a6")), { cols: 2, rows: 2, perSheet: 4 });
  assert.deepEqual(fit(paper("a4"), size("4x3")), { cols: 2, rows: 3, perSheet: 6 });
  assert.deepEqual(fit(paper("a4"), size("cr80")), { cols: 3, rows: 3, perSheet: 9 });
  assert.deepEqual(fit(paper("letter"), size("a6")), { cols: 2, rows: 1, perSheet: 2 }, "A6 is taller than half a Letter page");
  assert.deepEqual(fit(paper("letter"), size("4x3")), { cols: 2, rows: 3, perSheet: 6 });
});

test("people are split into full sheets in order", () => {
  assert.deepEqual(sheets([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(sheets([], 4), []);
  assert.deepEqual(sheets([1], 0), [], "never an endless loop");
});

test("only paid registrations become badges by default, with their type", () => {
  const subs = [
    { id: 7, form_type: "registration", status: "paid (test)", ticket: "Academic", data: { name: { label: "Full name", value: " Ada  Lovelace " }, organization: { label: "Organization", value: "Analytical Society" } } },
    { id: 8, form_type: "registration", status: "awaiting payment", ticket: "Industry", data: { name: { label: "Full name", value: "Grace Hopper" } } },
    { id: 9, form_type: "registration", status: "paid", ticket: "Student", data: { name: { value: "Alan Turing" } } },
    { id: 10, form_type: "contact", status: "new", data: { name: { value: "Not a registration" } } },
    { id: 11, form_type: "registration", status: "paid", data: { email: { value: "no-name@x.org" } } },
  ];
  const people = fromRegistrations(subs);
  assert.deepEqual(people.map(p => [p.code, p.name, p.organization, p.role, p.detail]),
    [["R7", "Ada Lovelace", "Analytical Society", "Attendee", "Academic"], ["R9", "Alan Turing", "", "Student", "Student"]]);
  assert.equal(fromRegistrations(subs, true).length, 3, "unpaid ones on request; a registration without a name is never printed");
});

test("speakers come from Event details with a safe badge code", () => {
  const people = fromSpeakers([{ id: "spk_1", name: "Prof. Amara Okafor", affiliation: "Delft", keynote: true }, { name: "  " }, null, { id: "bad id!", name: "Kenji" }]);
  assert.deepEqual(people.map(p => [p.code, p.name, p.role, p.detail]), [["S-spk_1", "Prof. Amara Okafor", "Speaker", "Keynote"], ["S-badid", "Kenji", "Speaker", ""]]);
  assert.deepEqual(fromSpeakers(undefined), []);
  for (const p of people) assert.match(p.code, /^[A-Za-z0-9_-]{1,40}$/);
});

test("CSV files with quotes, semicolons and Excel's marker are read correctly", () => {
  assert.deepEqual(parseCsv('﻿Name,Organization\r\n"Smith, Jane","Lab ""X"""\n\nBob,\n'), [["Name", "Organization"], ["Smith, Jane", 'Lab "X"'], ["Bob", ""]]);
  assert.deepEqual(parseCsv("Name;Role\nAda;Speaker"), [["Name", "Role"], ["Ada", "Speaker"]]);
  assert.deepEqual(parseCsv('Name\n"multi\nline"'), [["Name"], ["multi\nline"]]);
});

test("CSV people need a Name column; known roles are kept, others become a note", () => {
  let n = 0;
  const code = () => `B${++n}`;
  const { people } = fromCsv("Full name,Institution,Role\nAda,Analytical,speaker\nBob,,VIP\n,,Staff", code);
  assert.deepEqual(people.map(p => [p.code, p.name, p.organization, p.role, p.detail]), [["B1", "Ada", "Analytical", "Speaker", ""], ["B2", "Bob", "", "Attendee", "VIP"]]);
  assert.match(fromCsv("Email,Company\nx@y.z,Acme", code).problem!, /Name/);
  assert.match(fromCsv("", code).problem!, /empty/);
});

test("random badge codes are valid QR codes for the server", () => {
  const codes = new Set(Array.from({ length: 200 }, randomCode));
  assert.equal(codes.size, 200);
  for (const c of codes) assert.match(c, /^B[0-9A-F]{10}$/);
});
