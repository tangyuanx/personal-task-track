import Fastify, { type FastifyInstance } from "fastify";
import { type ServerConfig, loadConfig } from "./config.js";
import { createGitHubIssue, GitHubIssueError } from "./github.js";
import { createReportId, validateBugReport } from "./report.js";

type BuildOptions = {
  config?: ServerConfig;
  fetchImpl?: typeof globalThis.fetch;
  now?: () => number;
};

export function buildApp(options: BuildOptions = {}): FastifyInstance {
  const config = options.config || loadConfig();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const rateLimits = new Map<string, { count: number; resetAt: number }>();
  const app = Fastify({ logger: false, bodyLimit: config.bodyLimit, requestTimeout: 15_000 });

  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer")
      .header("permissions-policy", "camera=(), microphone=(), geolocation=()")
      .header("content-security-policy", "default-src 'none'; frame-ancestors 'none'")
      .header("cache-control", "no-store");

    const origin = request.headers.origin;
    if (origin && !config.allowedOrigins.has(origin)) {
      return reply.code(403).send(errorBody("CORS_NOT_ALLOWED", "当前来源不允许访问反馈服务"));
    }
    if (origin) {
      reply
        .header("access-control-allow-origin", origin)
        .header("vary", "Origin")
        .header("access-control-allow-methods", "POST, GET, OPTIONS")
        .header("access-control-allow-headers", "Content-Type");
    }
    if (request.method === "OPTIONS") return reply.code(204).send();
  });

  app.get("/health", async () => ({ success: true, status: "ok" }));

  app.post("/api/bug-reports", async (request, reply) => {
    const limit = consumeRateLimit(request.ip, rateLimits, config, now());
    reply.header("x-ratelimit-limit", config.rateLimitMax).header("x-ratelimit-remaining", limit.remaining);
    if (!limit.allowed) {
      reply.header("retry-after", Math.max(1, Math.ceil((limit.resetAt - now()) / 1000)));
      return reply.code(429).send(errorBody("RATE_LIMITED", "提交过于频繁，请稍后再试"));
    }
    if (!config.githubToken) {
      return reply.code(503).send(errorBody("SERVER_NOT_CONFIGURED", "反馈服务尚未配置"));
    }
    const validated = validateBugReport(request.body);
    if (!validated.ok) return reply.code(400).send(errorBody("INVALID_REQUEST", validated.message));

    const reportId = createReportId();
    try {
      const issue = await createGitHubIssue(validated.value, reportId, config, fetchImpl);
      return reply.code(201).send({ success: true, reportId, ...issue });
    } catch (error) {
      if (error instanceof GitHubIssueError) {
        return reply.code(error.statusCode).send(errorBody(error.code, error.message));
      }
      return reply.code(500).send(errorBody("INTERNAL_ERROR", "反馈服务内部错误"));
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const statusCode = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
    if (errorCode === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send(errorBody("PAYLOAD_TOO_LARGE", "请求内容不能超过 100KB"));
    }
    if (statusCode === 400) {
      return reply.code(400).send(errorBody("INVALID_JSON", "请求内容不是有效 JSON"));
    }
    return reply.code(500).send(errorBody("INTERNAL_ERROR", "反馈服务内部错误"));
  });

  return app;
}

function consumeRateLimit(
  ip: string,
  store: Map<string, { count: number; resetAt: number }>,
  config: ServerConfig,
  timestamp: number,
) {
  const current = store.get(ip);
  if (!current || current.resetAt <= timestamp) {
    const next = { count: 1, resetAt: timestamp + config.rateLimitWindowMs };
    store.set(ip, next);
    return { allowed: true, remaining: config.rateLimitMax - 1, resetAt: next.resetAt };
  }
  current.count += 1;
  return {
    allowed: current.count <= config.rateLimitMax,
    remaining: Math.max(0, config.rateLimitMax - current.count),
    resetAt: current.resetAt,
  };
}

function errorBody(code: string, message: string) {
  return { success: false, code, message };
}
