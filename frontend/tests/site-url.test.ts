import { test } from "node:test";
import assert from "node:assert/strict";
import { originFrom } from "../src/lib/site-url";

const from = (h: Record<string, string>) => (name: string) => h[name] ?? null;

test("the configured address wins and loses its trailing slash", () => {
  assert.equal(originFrom("https://sciprospect.example/ ", from({ host: "evil.test" })), "https://sciprospect.example");
});

test("without a setting the visitor's host is used, https behind the proxy", () => {
  assert.equal(originFrom("", from({ "x-forwarded-host": "sciprospect.example", "x-forwarded-proto": "https", host: "127.0.0.1:3000" })), "https://sciprospect.example");
  assert.equal(originFrom(undefined, from({ host: "sciprospect.example" })), "https://sciprospect.example");
  assert.equal(originFrom(undefined, from({ host: "localhost:3000" })), "http://localhost:3000");
});

test("a bad setting or a malformed host never ends up in links", () => {
  assert.equal(originFrom("not a url", from({ host: "ok.example" })), "https://ok.example");
  assert.equal(originFrom("", from({ host: "evil.test/<script>" })), "http://localhost:3000");
  assert.equal(originFrom("", from({ "x-forwarded-proto": "javascript", host: "ok.example" })), "https://ok.example");
});
