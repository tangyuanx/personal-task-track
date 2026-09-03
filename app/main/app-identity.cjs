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

function configureDesktopIdentity(app, pathApi = path) {
  if (!app?.getPath || !app?.setName || !app?.setPath) {
    throw new TypeError("A compatible Electron app instance is required.");
  }
  const userDataPath = legacyUserDataPath(app.getPath("appData"), pathApi);
  app.setName(APP_DISPLAY_NAME);
  app.setPath("userData", userDataPath);
  app.setAppUserModelId?.(DESKTOP_APP_ID);
  return { appId: DESKTOP_APP_ID, name: APP_DISPLAY_NAME, userDataPath };
}

module.exports = {
  APP_DISPLAY_NAME,
  DESKTOP_APP_ID,
  LEGACY_USER_DATA_DIRECTORY,
  WINDOWS_INSTALLER_GUID,
  configureDesktopIdentity,
  legacyUserDataPath,
};
