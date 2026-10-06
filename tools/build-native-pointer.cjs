const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function buildMacPointer(output, arch = process.arch) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const arches = arch === 'universal' ? ['arm64', 'x86_64'] : [arch === 'x64' ? 'x86_64' : arch];
  const result = spawnSync('/usr/bin/clang', [
    '-O2', '-fobjc-arc', '-mmacosx-version-min=12.0', ...arches.flatMap(value => ['-arch', value]),
    '-framework', 'Cocoa', '-framework', 'ApplicationServices',
    path.resolve(__dirname, '../app/main/native/pointer-mac.m'), '-o', output,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Native pointer build failed: ${result.stderr || result.error}`);
  fs.chmodSync(output, 0o755);
  return output;
}
module.exports = { buildMacPointer };
