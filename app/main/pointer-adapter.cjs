const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const crypto = require('node:crypto');

function createPointerAdapter({ app, platform = process.platform, onFailure = () => {} }) {
  let worker, nextId = 0, ready = false;
  const pending = new Map();
  function fail() {
    ready = false;
    for (const resolve of pending.values()) resolve({ ok: false, reason: 'adapter-unavailable' });
    pending.clear(); onFailure();
  }
  function request(op, extra = {}) {
    if (!worker || worker.killed || !worker.stdin.writable) return Promise.resolve({ ok: false, reason: 'adapter-unavailable' });
    return new Promise(resolve => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, reason: 'adapter-timeout' }); }, op === 'get' ? 6000 : 80);
      pending.set(id, result => { clearTimeout(timer); resolve(result); });
      worker.stdin.write(JSON.stringify({ id, op, ...extra }) + '\n');
    });
  }
  async function start() {
    try {
      if (platform === 'darwin') {
        let executable = path.join(process.resourcesPath, 'pointer', 'pointer-mac');
        if (!app.isPackaged) {
          const source = fs.readFileSync(path.join(__dirname, 'native/pointer-mac.m'));
          const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
          executable = path.join(os.tmpdir(), `loop-pointer-${hash}-${process.arch}`, 'pointer-mac');
          if (!fs.existsSync(executable)) require('../../tools/build-native-pointer.cjs').buildMacPointer(executable);
        }
        worker = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      } else if (platform === 'win32') {
        const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
        const script = app.isPackaged ? path.join(process.resourcesPath, 'pointer', 'pointer-win.ps1') : path.join(__dirname, 'native/pointer-win.ps1');
        // Fixed, packaged command source; no policy changes or downloaded code.
        // -Command also works on standard Windows installations whose default
        // policy does not run .ps1 files. No renderer payload enters this code.
        worker = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', fs.readFileSync(script, 'utf8')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } else return false;
      readline.createInterface({ input: worker.stdout }).on('line', line => {
        try { const result = JSON.parse(line); const resolve = pending.get(result.id); pending.delete(result.id); resolve?.(result); } catch { fail(); }
      });
      worker.on('error', fail); worker.on('exit', fail); worker.stdin.on('error', fail);
      // Native errors are codes only; no user content enters this protocol.
      worker.stderr.on('data', () => {});
      ready = (await request('get')).ok === true;
      return ready;
    } catch { fail(); return false; }
  }
  return { start, request, available: () => ready, stop() { ready = false; worker?.kill(); fail(); } };
}
module.exports = { createPointerAdapter };
