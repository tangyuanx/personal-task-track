export type ServerConfig = {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  port: number;
  allowedOrigins: Set<string>;
  bodyLimit: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  githubTimeoutMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    githubToken: String(env.GITHUB_TOKEN || "").trim(),
    githubOwner: String(env.GITHUB_OWNER || "tangyuanx").trim(),
    githubRepo: String(env.GITHUB_REPO || "personal-task-track").trim(),
    port: boundedNumber(env.PORT, 3000, 1, 65_535),
    allowedOrigins: new Set(
      String(env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    bodyLimit: 100 * 1024,
    rateLimitMax: 5,
    rateLimitWindowMs: 60 * 60 * 1000,
    githubTimeoutMs: boundedNumber(env.GITHUB_TIMEOUT_MS, 10_000, 100, 30_000),
  };
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}
