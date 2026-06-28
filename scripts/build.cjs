const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);

process.env.COPYFILE_DISABLE = "1";

const result = spawnSync(process.execPath, [require.resolve("electron-builder/cli.js"), ...args], {
  env: process.env,
  stdio: "inherit",
});

removeAppleDoubleFiles(path.join(process.cwd(), "release"));

process.exit(result.status ?? 1);

function removeAppleDoubleFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith("._")) {
      fs.rmSync(entryPath, { force: true, recursive: true });
      continue;
    }
    if (entry.isDirectory()) removeAppleDoubleFiles(entryPath);
  }
}
