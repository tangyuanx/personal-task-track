const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const knowledgeRecovery = require("../renderer/src/knowledge-recovery.js");

const RECOVERY_FILE = "knowledge-note-recovery.json";
let writeQueue = Promise.resolve();

function recoveryFilePath(userDataPath) {
  return path.join(userDataPath, RECOVERY_FILE);
}

async function backupCorruptRecovery(filePath) {
  const backupPath = `${filePath}.corrupt-${Date.now()}-${crypto.randomUUID()}`;
  try {
    await fs.rename(filePath, backupPath);
    return backupPath;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readKnowledgeRecovery(userDataPath) {
  try {
    const raw = await fs.readFile(recoveryFilePath(userDataPath), "utf8");
    return knowledgeRecovery.normalizeRecoveryData(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return knowledgeRecovery.normalizeRecoveryData({});
    if (error instanceof SyntaxError) {
      await backupCorruptRecovery(recoveryFilePath(userDataPath));
      return knowledgeRecovery.normalizeRecoveryData({});
    }
    throw error;
  }
}

async function writeRecoveryData(userDataPath, data) {
  await fs.mkdir(userDataPath, { recursive: true });
  const filePath = recoveryFilePath(userDataPath);
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const content = `${JSON.stringify(knowledgeRecovery.normalizeRecoveryData(data), null, 2)}\n`;
  let handle = null;
  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function enqueueWrite(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

function writeKnowledgeRecovery(userDataPath, value) {
  const record = knowledgeRecovery.normalizeRecoveryRecord(value);
  if (!record) throw new TypeError("A recovery record requires a noteId.");
  return enqueueWrite(async () => {
    const data = await readKnowledgeRecovery(userDataPath);
    data.records[record.noteId] = record;
    await writeRecoveryData(userDataPath, data);
    return record;
  });
}

function deleteKnowledgeRecovery(userDataPath, noteId) {
  const normalizedNoteId = String(noteId || "").trim();
  if (!normalizedNoteId) return Promise.resolve(false);
  return enqueueWrite(async () => {
    const data = await readKnowledgeRecovery(userDataPath);
    const existed = Boolean(data.records[normalizedNoteId]);
    delete data.records[normalizedNoteId];
    if (existed) await writeRecoveryData(userDataPath, data);
    return existed;
  });
}

module.exports = {
  RECOVERY_FILE,
  deleteKnowledgeRecovery,
  readKnowledgeRecovery,
  recoveryFilePath,
  writeKnowledgeRecovery,
};
