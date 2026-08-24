const fs = require("node:fs");
const path = require("node:path");

const releaseDirectory = path.resolve(process.argv[2] || "release");
const requireAllPlatforms = process.argv.includes("--require-all-platforms");
const allowedExtensions = new Set([".blockmap", ".dmg", ".exe", ".yml", ".zip"]);

if (!fs.existsSync(releaseDirectory)) fail(`Release directory does not exist: ${releaseDirectory}`);

const files = fs.readdirSync(releaseDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => entry.name);
const available = new Set(files);
const metadataFiles = files.filter((name) => /^latest(?:-mac)?\.yml$/i.test(name));

if (!metadataFiles.length) fail("No latest.yml or latest-mac.yml update metadata was generated.");
if (requireAllPlatforms) {
  for (const required of ["latest.yml", "latest-mac.yml"]) {
    if (!available.has(required)) fail(`Combined release is missing required update metadata: ${required}`);
  }
}

for (const metadataFile of metadataFiles) {
  const content = fs.readFileSync(path.join(releaseDirectory, metadataFile), "utf8");
  const urls = [...content.matchAll(/^\s*(?:-\s*)?url:\s*["']?([^"'\r\n]+?)["']?\s*$/gm)]
    .map((match) => decodeURIComponent(match[1].trim()).split(/[?#]/, 1)[0])
    .map((url) => path.basename(url));
  if (!urls.length) fail(`${metadataFile} does not contain any artifact URL.`);
  for (const url of urls) {
    if (!available.has(url)) fail(`${metadataFile} references missing artifact: ${url}`);
    if (/\s/.test(url)) fail(`${metadataFile} references a filename containing spaces: ${url}`);
  }
}

for (const file of files) {
  if (/\s/.test(file)) fail(`Release artifact contains spaces and is unsafe for the update feed: ${file}`);
}

console.log(`Verified ${metadataFiles.length} update metadata file(s) against ${files.length} release artifact(s).`);

function fail(message) {
  console.error(`Update artifact verification failed: ${message}`);
  process.exit(1);
}
