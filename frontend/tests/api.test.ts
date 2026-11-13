import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/lib/api";

test("API uses same-origin cookies, no cache, and JSON without browser token storage", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
    return Response.json({ ok: true });
  };
  try { assert.deepEqual(await api("/api/test", { method: "POST", body: "{}" }), { ok: true }); }
  finally { globalThis.fetch = original; }
});
test("permission failures preserve status and safe user-facing error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ detail: "Access denied" }, { status: 403 });
  try { await assert.rejects(api("/api/test"), error => error instanceof ApiError && error.status === 403 && error.message === "Access denied"); }
  finally { globalThis.fetch = original; }
});
