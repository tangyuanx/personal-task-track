const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createNotificationCapabilityReader,
  detectNotificationCapability,
  parseMacNotificationFlags,
  parsePlistDicts,
  parseWindowsToastSetting,
} = require("../app/main/notification-capability.cjs");

const NCPREFS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>apps</key>
	<array>
		<dict>
			<key>bundle-id</key>
			<string>io.example.allowed</string>
			<key>flags</key>
			<integer>41951246</integer>
			<key>src</key>
			<array>
				<dict>
					<key>flags</key>
					<integer>6</integer>
					<key>req</key>
					<data>+t4MAAAAADgAAAABAAAABgAAAAIAAAAc</data>
				</dict>
			</array>
		</dict>
		<dict>
			<key>bundle-id</key>
			<string>io.example.muted</string>
			<key>flags</key>
			<integer>0</integer>
		</dict>
	</array>
	<key>other</key>
	<array>
		<dict>
			<key>bundle-id</key>
			<string>io.example.elsewhere</string>
			<key>flags</key>
			<integer>0</integer>
		</dict>
	</array>
</dict>
</plist>`;

test("phase19: the macOS record is read only at the first dict level", () => {
  const entries = parsePlistDicts(NCPREFS_XML, "apps");
  assert.deepEqual(entries.map((entry) => entry["bundle-id"]), ["io.example.allowed", "io.example.muted"]);
  // the nested src record must not be mistaken for an app record
  assert.equal(entries.length, 2);
  assert.equal(entries[0].flags, "41951246");
});

test("phase19: macOS flags distinguish allowed, muted and unregistered bundles", () => {
  assert.deepEqual(parseMacNotificationFlags(NCPREFS_XML, "io.example.allowed"), {
    state: "allowed", source: "macos-ncprefs", detail: "flags=41951246",
  });
  assert.deepEqual(parseMacNotificationFlags(NCPREFS_XML, "io.example.muted"), {
    state: "blocked", source: "macos-ncprefs", detail: "flags=0",
  });
  assert.deepEqual(parseMacNotificationFlags(NCPREFS_XML, "io.example.missing"), {
    state: "unknown", source: "macos-ncprefs", detail: "not-registered",
  });
  assert.equal(parseMacNotificationFlags("not a plist", "io.example.allowed").state, "unknown");
  // a JSON payload (older macOS where plutil can convert) is accepted too
  const json = JSON.stringify({ apps: [{ "bundle-id": "io.example.muted", flags: 0 }] });
  assert.equal(parseMacNotificationFlags(json, "io.example.muted").state, "blocked");
});

test("phase19: the Windows toast setting maps every disabled variant to blocked", () => {
  assert.equal(parseWindowsToastSetting("Enabled").state, "allowed");
  for (const value of ["DisabledForApplication", "DisabledForUser", "DisabledByGroupPolicy", "DisabledByManifest"]) {
    const parsed = parseWindowsToastSetting(value);
    assert.equal(parsed.state, "blocked", value);
    assert.equal(parsed.detail, value);
  }
  assert.equal(parseWindowsToastSetting("").state, "unknown");
  assert.equal(parseWindowsToastSetting("something else").state, "unknown");
});

test("phase19: a platform probe that fails or is unsupported stays unknown", async () => {
  const failing = async () => ({ ok: false, stdout: "" });
  assert.equal((await detectNotificationCapability({ platform: "darwin", bundleId: "io.example.allowed", runner: failing })).state, "unknown");

  const windows = await detectNotificationCapability({
    platform: "win32",
    appId: "io.example.app",
    runner: async (command, args) => {
      assert.equal(command, "powershell.exe");
      assert.match(args.join(" "), /CreateToastNotifier\('io\.example\.app'\)/);
      return { ok: true, stdout: "DisabledForUser" };
    },
  });
  assert.deepEqual(windows, { state: "blocked", source: "windows-toast", detail: "DisabledForUser" });

  const other = await detectNotificationCapability({ platform: "linux" });
  assert.equal(other.state, "unknown");
  assert.equal(other.source, "platform-unsupported");
});

test("phase19: the capability reader caches a probe and can be forced to re-read", async () => {
  let calls = 0;
  let clock = 0;
  const reader = createNotificationCapabilityReader({
    platform: "win32",
    appId: "io.example.app",
    now: () => clock,
    runner: async () => {
      calls += 1;
      return { ok: true, stdout: calls === 1 ? "Enabled" : "DisabledForUser" };
    },
  });
  assert.equal((await reader.read()).state, "allowed");
  clock += 1_000;
  assert.equal((await reader.read()).state, "allowed");
  assert.equal(calls, 1, "a cached probe is reused inside its ttl");
  clock += 120_000;
  assert.equal((await reader.read()).state, "blocked");
  assert.equal(calls, 2);
  assert.equal((await reader.read({ force: true })).state, "blocked");
  assert.equal(calls, 3);
});
