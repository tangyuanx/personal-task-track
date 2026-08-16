const esbuild = require("esbuild");

async function main() {
  await esbuild.build({
    entryPoints: ["app/renderer/src/milkdown-editor.entry.js"],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    outfile: "app/renderer/src/vendor/milkdown-editor.js",
    loader: {
      ".css": "css",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
