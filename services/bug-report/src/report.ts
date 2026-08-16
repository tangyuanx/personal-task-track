import { randomBytes } from "node:crypto";

const categories = new Set([
  "功能异常",
  "软件崩溃",
  "数据异常",
  "界面显示",
  "性能问题",
  "功能建议",
  "其他",
]);

export type EnvironmentInfo = {
  appVersion: string;
  os: string;
  architecture: string;
  currentPage: string;
  installationId: string;
  submittedAt: string;
};

export type BugReport = {
  title: string;
  category: string;
  description: string;
  reproductionSteps: string;
  contact: string;
  includeEnvironment: boolean;
  environment?: EnvironmentInfo;
};

export type ValidationResult =
  | { ok: true; value: BugReport }
  | { ok: false; message: string };

export function validateBugReport(input: unknown): ValidationResult {
  if (!isRecord(input)) return invalid("请提交有效的反馈内容");
  const title = cleanText(input.title);
  const category = cleanText(input.category);
  const description = cleanText(input.description);
  const reproductionSteps = cleanText(input.reproductionSteps);
  const contact = cleanText(input.contact);
  const includeEnvironment = input.includeEnvironment !== false;

  if (length(title) < 3 || length(title) > 100) return invalid("问题标题需为 3～100 字");
  if (!categories.has(category)) return invalid("请选择有效的问题类型");
  if (length(description) < 10 || length(description) > 5000) return invalid("问题描述需为 10～5000 字");
  if (length(reproductionSteps) > 5000) return invalid("复现步骤最多 5000 字");
  if (length(contact) > 200) return invalid("联系方式最多 200 字");

  let environment: EnvironmentInfo | undefined;
  if (includeEnvironment) {
    if (!isRecord(input.environment)) return invalid("缺少基础环境信息");
    environment = {
      appVersion: limitedText(input.environment.appVersion, 50),
      os: limitedText(input.environment.os, 200),
      architecture: limitedText(input.environment.architecture, 50),
      currentPage: limitedText(input.environment.currentPage, 100),
      installationId: cleanText(input.environment.installationId).toLowerCase(),
      submittedAt: cleanText(input.environment.submittedAt),
    };
    if (!environment.appVersion || !environment.os || !environment.architecture || !environment.currentPage) {
      return invalid("基础环境信息不完整");
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(environment.installationId)) {
      return invalid("安装标识无效");
    }
    if (!Number.isFinite(new Date(environment.submittedAt).getTime())) return invalid("提交时间无效");
  }

  return {
    ok: true,
    value: { title, category, description, reproductionSteps, contact, includeEnvironment, environment },
  };
}

export function createReportId(date = new Date()) {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `BR-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function cleanText(value: unknown) {
  return (typeof value === "string" ? value : "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function limitedText(value: unknown, max: number) {
  const text = cleanText(value);
  return length(text) <= max ? text : "";
}

function length(value: string) {
  return Array.from(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): ValidationResult {
  return { ok: false, message };
}
