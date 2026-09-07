const esbuild = require("esbuild");
const fs = require("node:fs/promises");

const outputScript = "app/renderer/src/vendor/milkdown-editor.js";
const outputStyles = "app/renderer/src/vendor/milkdown-editor.css";

function applyGlobalFontScale(css) {
  const scalePixels = (value) => value.replace(/(-?\d*\.?\d+)px/g, (_, number) => `calc(${number} * var(--font-unit))`);
  return css
    .replace(/(font-size\s*:\s*)([^;{}]+)/gi, (_, prefix, value) => prefix + scalePixels(value))
    .replace(/(line-height\s*:\s*)([^;{}]+)/gi, (_, prefix, value) => prefix + scalePixels(value))
    .replace(/(\bfont\s*:\s*)([^;{}]+)/gi, (_, prefix, value) => prefix + scalePixels(value));
}

async function main() {
  await esbuild.build({
    entryPoints: ["app/renderer/src/milkdown-editor.entry.js"],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    outfile: outputScript,
    loader: {
      ".css": "css",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
  const css = await fs.readFile(outputStyles, "utf8");
  await fs.writeFile(outputStyles, applyGlobalFontScale(css));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
