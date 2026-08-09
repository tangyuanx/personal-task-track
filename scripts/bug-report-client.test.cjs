const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createBugReportClient,
  sanitizeReportPayload,
} = require("../electron/bug-report-client.cjs");

test("client reports an offline network without exposing transport details", async () => {
  const client = createBugReportClient({
    baseUrl: "https://feedback.example.com",
    fetchImpl: async () => { throw new TypeError("getaddrinfo secret-host"); },
  });
  await assert.rejects(client.submit({}), (error) => {
    assert.equal(error.code, "NETWORK_UNAVAILABLE");
    assert.doesNotMatch(error.message, /secret-host/);
    return true;
  });
});

test("client aborts a request that exceeds its timeout", async () => {
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const client = createBugReportClient({ baseUrl: "https://feedback.example.com", fetchImpl, timeoutMs: 15 });
  await assert.rejects(client.submit({}), (error) => error.code === "REQUEST_TIMEOUT");
});

test("client rejects non-JSON server content", async () => {
  const client = createBugReportClient({
    baseUrl: "https://feedback.example.com",
    fetchImpl: async () => new Response("upstream proxy page", { status: 502 }),
  });
  await assert.rejects(client.submit({}), (error) => error.code === "INVALID_SERVER_RESPONSE");
});

test("client only forwards allowlisted report and environment fields", () => {
  const payload = sanitizeReportPayload({
    title: "title",
    category: "功能异常",
    description: "description",
    includeEnvironment: true,
    taskDatabase: "must-not-leave-device",
    authorization: "must-not-leave-device",
    environment: {
      appVersion: "1.0.0",
      os: "macOS",
      architecture: "arm64",
      currentPage: "Task Flow",
      installationId: "uuid",
      submittedAt: "now",
      userHome: "/private/user",
    },
  });
  assert.equal(payload.taskDatabase, undefined);
  assert.equal(payload.authorization, undefined);
  assert.equal(payload.environment.userHome, undefined);
});
