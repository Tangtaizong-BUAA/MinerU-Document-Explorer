import assert from "node:assert/strict";
import test from "node:test";

process.env.CYJ_AGENT_DEMO_MODE = "1";
const { createAppServer } = await import("../server/index.mjs");

async function withServer(run) {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("base path without slash redirects once and slash path serves the app", async () => {
  await withServer(async (base) => {
    const redirect = await fetch(`${base}/cyj/agent`, { redirect: "manual" });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get("location"), "/cyj/agent/");

    const page = await fetch(`${base}/cyj/agent/`, { redirect: "manual" });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root"><\/div>/);
  });
});
