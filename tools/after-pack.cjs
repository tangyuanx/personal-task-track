const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  removeAppleDoubleFiles(context.appOutDir);
};

function removeAppleDoubleFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith("._")) {
      fs.rmSync(entryPath, { force: true, recursive: true });
      continue;
    }
    if (entry.isDirectory()) removeAppleDoubleFiles(entryPath);
  }
}
