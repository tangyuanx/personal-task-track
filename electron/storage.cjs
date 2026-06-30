const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_FILE = "task-data.json";
const DATA_VERSION = 1;

function dataFilePath(userDataPath) {
  return path.join(userDataPath, DATA_FILE);
}

async function readTaskData(userDataPath) {
  try {
    const raw = await fs.readFile(dataFilePath(userDataPath), "utf8");
    return normalizeTaskData(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      await backupCorruptData(userDataPath);
      return null;
    }
    throw error;
  }
}

async function writeTaskData(userDataPath, data) {
  const normalized = normalizeTaskData(data);
  await fs.mkdir(userDataPath, { recursive: true });
  const filePath = dataFilePath(userDataPath);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
  return normalized;
}

function normalizeTaskData(data) {
  const safeData = data && typeof data === "object" ? data : {};
  return {
    version: DATA_VERSION,
    tasks: Array.isArray(safeData.tasks) ? safeData.tasks : [],
    taskGroups: Array.isArray(safeData.taskGroups) ? safeData.taskGroups : [],
    activeGroupId: typeof safeData.activeGroupId === "string" ? safeData.activeGroupId : "",
    flowWidths: safeData.flowWidths && typeof safeData.flowWidths === "object" ? safeData.flowWidths : {},
    sidebarWidth: Number.isFinite(Number(safeData.sidebarWidth)) ? Number(safeData.sidebarWidth) : 272,
    detailHeight: Number.isFinite(Number(safeData.detailHeight)) ? Number(safeData.detailHeight) : 58,
    attachments: safeData.attachments && typeof safeData.attachments === "object" ? safeData.attachments : { images: {} },
    theme: safeData.theme === "dark" ? "dark" : "light",
    font: ["songti", "heiti", "system", "mono"].includes(safeData.font) ? safeData.font : "songti",
    zhFont: typeof safeData.zhFont === "string" ? safeData.zhFont : "songti",
    enFont: typeof safeData.enFont === "string" ? safeData.enFont : "inter",
    tone: typeof safeData.tone === "string" ? safeData.tone : "focus",
    taskFilter: typeof safeData.taskFilter === "string" ? safeData.taskFilter : "",
    priorityFilter: typeof safeData.priorityFilter === "string" ? safeData.priorityFilter : "",
    newTaskPriority: typeof safeData.newTaskPriority === "string" ? safeData.newTaskPriority : "",
    updatedAt: typeof safeData.updatedAt === "string" ? safeData.updatedAt : new Date().toISOString(),
  };
}

async function backupCorruptData(userDataPath) {
  const filePath = dataFilePath(userDataPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(userDataPath, `task-data.corrupt-${timestamp}.json`);
  try {
    await fs.rename(filePath, backupPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

module.exports = {
  DATA_FILE,
  dataFilePath,
  readTaskData,
  writeTaskData,
};
