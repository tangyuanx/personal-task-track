const path = require("node:path");

const APP_DISPLAY_NAME = "Loop";
const DESKTOP_APP_ID = "io.github.tangyuanx.personal-task-track";
const LEGACY_USER_DATA_DIRECTORY = "Personal Task Track";
const WINDOWS_INSTALLER_GUID = "202fcf38-9bdb-57df-9a48-40d277bbfed9";

function legacyUserDataPath(appDataPath, pathApi = path) {
  if (typeof appDataPath !== "string" || !appDataPath.trim()) {
    throw new TypeError("A valid Electron appData path is required.");
  }
  return pathApi.join(appDataPath, LEGACY_USER_DATA_DIRECTORY);
}

/**
 * An explicitly requested profile (tests, portable runs, parallel instances)
 * must win over the legacy redirect, otherwise the caller silently writes into
 * the developer's real task database.
 */
function explicitUserDataPath(argv = process.argv, env = process.env) {
  const fromEnvironment = typeof env?.LOOP_USER_DATA_DIR === "string" ? env.LOOP_USER_DATA_DIR.trim() : "";
  if (fromEnvironment) return fromEnvironment;
  for (const value of Array.isArray(argv) ? argv : []) {
    const text = String(value || "");
    if (text.startsWith("--user-data-dir=")) return text.slice("--user-data-dir=".length);
  }
  return "";
}

function configureDesktopIdentity(app, pathApi = path, { argv = process.argv, env = process.env } = {}) {
  if (!app?.getPath || !app?.setName || !app?.setPath) {
    throw new TypeError("A compatible Electron app instance is required.");
  }
  const requestedProfile = explicitUserDataPath(argv, env);
  const userDataPath = requestedProfile || legacyUserDataPath(app.getPath("appData"), pathApi);
  app.setName(APP_DISPLAY_NAME);
  app.setPath("userData", userDataPath);
  app.setAppUserModelId?.(DESKTOP_APP_ID);
  return {
    appId: DESKTOP_APP_ID,
    name: APP_DISPLAY_NAME,
    userDataPath,
    usesExplicitProfile: Boolean(requestedProfile),
  };
}

module.exports = {
  APP_DISPLAY_NAME,
  explicitUserDataPath,
  DESKTOP_APP_ID,
  LEGACY_USER_DATA_DIRECTORY,
  WINDOWS_INSTALLER_GUID,
  configureDesktopIdentity,
  legacyUserDataPath,
};
