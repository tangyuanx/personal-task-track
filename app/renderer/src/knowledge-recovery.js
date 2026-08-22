(function exposeKnowledgeRecovery(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KnowledgeRecovery = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  const RECOVERY_VERSION = 1;

  function normalizeText(value) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }

  function normalizeHash(value) {
    const hash = normalizeText(value).trim();
    return hash || null;
  }

  function normalizeTimestamp(value) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }

  function normalizeRecoveryAsset(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const source = normalizeText(raw.source).trim();
    const dataUrl = normalizeText(raw.dataUrl).trim();
    if (!source || !dataUrl.toLowerCase().startsWith("data:image/")) return null;
    return { source, dataUrl };
  }

  function normalizeRecoveryRecord(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const noteId = normalizeText(raw.noteId).trim();
    if (!noteId) return null;
    return {
      noteId,
      content: normalizeText(raw.content),
      updatedAt: normalizeTimestamp(raw.updatedAt),
      baseFileHash: normalizeHash(raw.baseFileHash),
      assets: Array.isArray(raw.assets) ? raw.assets.map(normalizeRecoveryAsset).filter(Boolean) : [],
    };
  }

  function normalizeRecoveryData(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const source = raw.records && typeof raw.records === "object" && !Array.isArray(raw.records) ? raw.records : {};
    const records = {};
    Object.entries(source).forEach(([key, value]) => {
      const record = normalizeRecoveryRecord({ ...value, noteId: value?.noteId || key });
      if (record) records[record.noteId] = record;
    });
    return { version: RECOVERY_VERSION, records };
  }

  function isRecoveryNewerThan(record, baselineTimestamp) {
    const updatedAt = Date.parse(record?.updatedAt || "");
    const baseline = Date.parse(baselineTimestamp || "");
    return Number.isFinite(updatedAt) && (!Number.isFinite(baseline) || updatedAt > baseline);
  }

  return Object.freeze({
    RECOVERY_VERSION,
    isRecoveryNewerThan,
    normalizeRecoveryData,
    normalizeRecoveryRecord,
  });
});
