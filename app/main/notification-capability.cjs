// Phase19 · real notification permission probe
//
// The frozen Demo could only simulate "系统通知关闭" because it has no OS access.
// Electron itself exposes no notification-permission API (systemPreferences
// .getMediaAccessStatus covers microphone/camera/screen only), so the product
// reads what each platform actually publishes:
//   - Windows: WinRT ToastNotificationManager.CreateToastNotifier(appId).Setting
//   - macOS:   the per-bundle record in com.apple.ncprefs
// Anything that cannot be read stays "unknown" — the interface must never claim
// the system muted notifications when that is only a guess.

const { execFile } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const PROBE_TIMEOUT_MS = 2_000;
const CACHE_TTL_MS = 60_000;

const UNKNOWN = Object.freeze({ state: "unknown", source: "none", detail: "" });

function normalizeProbeResult(value) {
  const raw = value && typeof value === "object" ? value : {};
  const state = ["allowed", "blocked", "unknown"].includes(raw.state) ? raw.state : "unknown";
  return {
    state,
    source: String(raw.source || "none").slice(0, 40),
    detail: String(raw.detail || "").slice(0, 120),
  };
}

/**
 * Windows: `NotificationSetting` reports whether this AppUserModelID may show
 * toasts. Enabled → allowed; every disabled variant → blocked; a query that
 * fails (older Windows, policy, missing PowerShell) stays unknown.
 */
function parseWindowsToastSetting(output) {
  const text = String(output || "").trim();
  if (!text) return { ...UNKNOWN, source: "windows-toast" };
  const match = text.match(/\b(Enabled|DisabledForApplication|DisabledForUser|DisabledByGroupPolicy|DisabledByManifest)\b/);
  if (!match) return { ...UNKNOWN, source: "windows-toast", detail: text.slice(0, 60) };
  const value = match[1];
  return {
    state: value === "Enabled" ? "allowed" : "blocked",
    source: "windows-toast",
    detail: value,
  };
}

function windowsProbeScript(appId) {
  const id = String(appId || "").replace(/'/g, "''");
  return [
    "$ErrorActionPreference='Stop'",
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null",
    `$n=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${id}')`,
    "[Console]::Out.Write([string]$n.Setting)",
  ].join("; ");
}

/**
 * macOS: com.apple.ncprefs holds one record per bundle that ever asked for
 * notifications. Bit 0 of `flags` is the "allow notifications" switch. A bundle
 * with no record has simply never registered, which is unknown, not blocked.
 */
/**
 * The real com.apple.ncprefs.plist cannot be converted to JSON (it carries a
 * data value), so its XML export is read with a small scanner: within the
 * `apps` array each <dict> maps a bundle-id to a flags integer. No dependency
 * is added for this.
 */
function parsePlistDicts(xml, sectionKey = "apps") {
  const text = String(xml || "");
  const sectionAt = text.indexOf(`<key>${sectionKey}</key>`);
  if (sectionAt < 0) return [];
  const arrayStart = text.indexOf("<array>", sectionAt);
  if (arrayStart < 0) return [];
  // Linear scan with depth counters. The apps array contains nested arrays and
  // dicts (macOS keeps per-source records under `src`), so the array is closed
  // by depth, not by the first </array>, and only first-level dicts are read —
  // a nested dict must never be mistaken for the app's own record.
  // `<key>name</key>` and `<string>value</string>` must stay single tokens;
  // a plain `/<[^>]+>|[^<]+/g` split would tear them apart.
  // The slice starts after the apps array's own <array>, so first-level dicts
  // are exactly the ones seen at arrayDepth 0.
  const inner = text.slice(arrayStart + "<array>".length);
  const tokens = inner.match(/<(key|string|integer|real)>[^<]*<\/\1>|<\/?[a-z]+>|[^<]+/g) || [];
  const dicts = [];
  let arrayDepth = 0;
  let dictDepth = 0;
  let current = null;
  let key = "";
  for (const token of tokens) {
    if (token === "<array>") {
      arrayDepth += 1;
      continue;
    }
    if (token === "</array>") {
      if (arrayDepth === 0) break;   // the apps array itself ends here
      arrayDepth -= 1;
      continue;
    }
    if (token === "<dict>") {
      dictDepth += 1;
      if (dictDepth === 1 && arrayDepth === 0) current = {};
      continue;
    }
    if (token === "</dict>") {
      // Only the outer dict is collected; a nested one must not clear it.
      if (dictDepth === 1) {
        if (current && Object.keys(current).length) dicts.push(current);
        current = null;
      }
      dictDepth -= 1;
      continue;
    }
    if (dictDepth !== 1 || arrayDepth !== 0) continue;
    const keyMatch = /^<key>([\s\S]*)<\/key>$/.exec(token);
    if (keyMatch) {
      key = keyMatch[1];
      continue;
    }
    const valueMatch = /^<(string|integer|real)>([\s\S]*)<\/\1>$/.exec(token);
    if (valueMatch && current && key) {
      if (!(key in current)) current[key] = valueMatch[2];
      key = "";
    }
  }
  return dicts;
}

function parseMacNotificationFlags(payload, bundleId) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  let entries = [];
  if (/<plist|<dict>/.test(text)) {
    entries = parsePlistDicts(text, "apps");
  } else {
    try {
      const data = JSON.parse(text);
      entries = (Array.isArray(data?.apps) ? data.apps : []).map((item) => ({
        "bundle-id": item?.["bundle-id"],
        flags: item?.flags,
      }));
    } catch {
      return { ...UNKNOWN, source: "macos-ncprefs", detail: "unparsable" };
    }
  }
  const wanted = String(bundleId || "").toLowerCase();
  const entry = entries.find((item) => String(item["bundle-id"] || "").toLowerCase() === wanted);
  if (!entry) return { ...UNKNOWN, source: "macos-ncprefs", detail: "not-registered" };
  const flags = Number(entry.flags);
  if (!Number.isFinite(flags)) return { ...UNKNOWN, source: "macos-ncprefs", detail: "no-flags" };
  // Only the unambiguous case is called blocked: the system holds a record for
  // this bundle whose style bits are all clear, i.e. every notification style
  // is off. Anything else stays "allowed" with the raw flags kept for
  // diagnosis — the individual style bits are not interpreted here.
  return {
    state: flags === 0 ? "blocked" : "allowed",
    source: "macos-ncprefs",
    detail: `flags=${flags}`,
  };
}

function run(command, args, { timeout = PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { timeout, windowsHide: true, maxBuffer: 64 * 1024 }, (error, stdout) => {
        if (error) resolve({ ok: false, stdout: String(stdout || ""), error });
        else resolve({ ok: true, stdout: String(stdout || "") });
      });
    } catch (error) {
      resolve({ ok: false, stdout: "", error });
    }
  });
}

async function probeWindows({ appId, runner = run } = {}) {
  const result = await runner("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsProbeScript(appId)]);
  if (!result.ok && !result.stdout) return { ...UNKNOWN, source: "windows-toast" };
  return parseWindowsToastSetting(result.stdout);
}

async function probeMac({ bundleId, runner = run, home = os.homedir() } = {}) {
  const plistPath = path.join(home, "Library", "Preferences", "com.apple.ncprefs.plist");
  const result = await runner("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath]);
  if (!result.ok || !result.stdout.trim()) {
    // plutil refuses this plist (it carries a data value), so the XML export is
    // read instead; the parse result keeps its own detail.
    const fallback = await runner("/usr/bin/defaults", ["export", "com.apple.ncprefs", "-"]);
    if (!fallback.ok || !fallback.stdout.trim()) return { ...UNKNOWN, source: "macos-ncprefs" };
    return parseMacNotificationFlags(fallback.stdout, bundleId);
  }
  return parseMacNotificationFlags(result.stdout, bundleId);
}

/**
 * @returns {Promise<{state:'allowed'|'blocked'|'unknown', source:string, detail:string}>}
 */
async function detectNotificationCapability({
  platform = process.platform,
  appId = "",
  bundleId = appId,
  runner = run,
  home,
} = {}) {
  if (platform === "win32") return normalizeProbeResult(await probeWindows({ appId, runner }));
  if (platform === "darwin") return normalizeProbeResult(await probeMac({ bundleId, runner, home }));
  return { ...UNKNOWN, source: "platform-unsupported" };
}

/**
 * Small cached wrapper: the probe shells out, so it is reused for a minute and
 * never blocks a scan on a hung platform call.
 */
function createNotificationCapabilityReader(options = {}) {
  const { platform = process.platform, now = () => Date.now(), ttl = CACHE_TTL_MS } = options;
  let cached = null;
  let cachedAt = 0;
  return {
    async read({ force = false } = {}) {
      if (!force && cached && now() - cachedAt < ttl) return cached;
      const result = normalizeProbeResult(await detectNotificationCapability({ ...options, platform }));
      cached = result;
      cachedAt = now();
      return result;
    },
    peek: () => cached,
  };
}

module.exports = {
  CACHE_TTL_MS,
  PROBE_TIMEOUT_MS,
  createNotificationCapabilityReader,
  detectNotificationCapability,
  normalizeProbeResult,
  parseMacNotificationFlags,
  parsePlistDicts,
  parseWindowsToastSetting,
  windowsProbeScript,
};
