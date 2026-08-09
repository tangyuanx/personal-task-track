const DEFAULT_TIMEOUT_MS = 10_000;

class BugReportClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BugReportClientError";
    this.code = code;
  }
}

function createBugReportClient({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const endpoint = bugReportEndpoint(baseUrl);
  if (typeof fetchImpl !== "function") {
    throw new BugReportClientError("NETWORK_UNAVAILABLE", "当前环境无法连接反馈服务");
  }

  return {
    async submit(payload) {
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sanitizeReportPayload(payload)),
          signal: controller.signal,
        });
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new BugReportClientError("INVALID_SERVER_RESPONSE", "反馈服务返回了无法识别的内容");
        }

        if (!response.ok || data?.success !== true) {
          throw new BugReportClientError(
            safeCode(data?.code, response.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED"),
            safeMessage(data?.message, response.status >= 500 ? "反馈服务暂时不可用，请稍后重试" : "反馈提交失败"),
          );
        }
        if (!/^BR-[A-Z0-9-]{6,40}$/.test(String(data.reportId || ""))) {
          throw new BugReportClientError("INVALID_SERVER_RESPONSE", "反馈服务未返回有效的反馈编号");
        }
        return {
          success: true,
          reportId: String(data.reportId),
          issueNumber: Number.isInteger(data.issueNumber) ? data.issueNumber : null,
          issueUrl: /^https:\/\/github\.com\//.test(String(data.issueUrl || "")) ? String(data.issueUrl) : "",
        };
      } catch (error) {
        if (error instanceof BugReportClientError) throw error;
        if (timedOut || error?.name === "AbortError") {
          throw new BugReportClientError("REQUEST_TIMEOUT", "提交超时，请检查网络后重试");
        }
        throw new BugReportClientError("NETWORK_UNAVAILABLE", "网络不可用，请检查连接后重试");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function bugReportEndpoint(baseUrl) {
  if (!baseUrl) {
    throw new BugReportClientError("SERVICE_NOT_CONFIGURED", "反馈服务尚未配置");
  }
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new BugReportClientError("SERVICE_NOT_CONFIGURED", "反馈服务地址无效");
  }
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHosts.has(url.hostname))) {
    throw new BugReportClientError("INSECURE_SERVICE_URL", "反馈服务必须使用 HTTPS");
  }
  return new URL("/api/bug-reports", `${url.origin}/`).toString();
}

function sanitizeReportPayload(payload) {
  const report = payload && typeof payload === "object" ? payload : {};
  const environment = report.environment && typeof report.environment === "object" ? report.environment : {};
  return {
    title: stringValue(report.title),
    category: stringValue(report.category),
    description: stringValue(report.description),
    reproductionSteps: stringValue(report.reproductionSteps),
    contact: stringValue(report.contact),
    includeEnvironment: report.includeEnvironment !== false,
    environment: report.includeEnvironment === false
      ? undefined
      : {
          appVersion: stringValue(environment.appVersion),
          os: stringValue(environment.os),
          architecture: stringValue(environment.architecture),
          currentPage: stringValue(environment.currentPage),
          installationId: stringValue(environment.installationId),
          submittedAt: stringValue(environment.submittedAt),
        },
  };
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function safeCode(value, fallback) {
  return /^[A-Z][A-Z0-9_]{2,48}$/.test(String(value || "")) ? String(value) : fallback;
}

function safeMessage(value, fallback) {
  const message = typeof value === "string" ? value.trim().slice(0, 240) : "";
  return message || fallback;
}

module.exports = {
  BugReportClientError,
  bugReportEndpoint,
  createBugReportClient,
  sanitizeReportPayload,
};
