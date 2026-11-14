import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/lib/api";

test("organization overview fetches scoped data via credentials", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/organization/overview");
    assert.equal(init?.credentials, "same-origin");
    return Response.json({
      org_name: "Institute Alpha",
      seat_limit: 5,
      members: [],
      conferences: [],
    });
  };
  try {
    const res = await api<{ org_name: string }>("/api/organization/overview");
    assert.equal(res.org_name, "Institute Alpha");
  } finally {
    globalThis.fetch = original;
  }
});

test("organization member addition sends validated payload", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/organization/team/add");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.name, "Dr. Alice");
    assert.equal(body.email, "alice@alpha.test");
    assert.equal(body.role, "editor");
    assert.equal(body.scistudio_access, true);
    return Response.json({ status: "ok" });
  };
  try {
    const res = await api<{ status: string }>("/api/organization/team/add", {
      method: "POST",
      body: JSON.stringify({
        name: "Dr. Alice",
        email: "alice@alpha.test",
        role: "editor",
        scistudio_access: true,
      }),
    });
    assert.equal(res.status, "ok");
  } finally {
    globalThis.fetch = original;
  }
});

test("seat limit breach error is caught cleanly by API client", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ detail: "Team seat limit reached (5 seats)." }, { status: 400 });
  try {
    await assert.rejects(
      api("/api/organization/team/add", { method: "POST", body: JSON.stringify({}) }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes("limit reached")
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("member removal and studio toggle dispatch expected payload", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/organization/team/remove");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.member_id, "mem-1234");
      return Response.json({ status: "ok" });
    };
    await api("/api/organization/team/remove", {
      method: "POST",
      body: JSON.stringify({ member_id: "mem-1234" }),
    });

    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/organization/team/toggle-scistudio");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.member_id, "mem-1234");
      assert.equal(body.enabled, false);
      return Response.json({ status: "ok" });
    };
    await api("/api/organization/team/toggle-scistudio", {
      method: "POST",
      body: JSON.stringify({ member_id: "mem-1234", enabled: false }),
    });
  } finally {
    globalThis.fetch = original;
  }
});
