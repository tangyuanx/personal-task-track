const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const resources = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  if (context.electronPlatformName === "darwin") {
    const { Arch } = require("builder-util");
    require("./build-native-pointer.cjs").buildMacPointer(path.join(resources, "pointer", "pointer-mac"), Arch[context.arch]);
  } else if (context.electronPlatformName === "win32") {
    fs.mkdirSync(path.join(resources, "pointer"), { recursive: true });
    fs.copyFileSync(path.join(__dirname, "../app/main/native/pointer-win.ps1"), path.join(resources, "pointer", "pointer-win.ps1"));
  }
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
