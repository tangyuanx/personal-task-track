// ------------------------------------------------------------
// Phase18 · shared preview clock
//
// Ported from the frozen Demo's loop-time-phase18.js, where `demoToday` and
// `demoNow` became mutable and every time-based decision read them. The
// product needs the same single source of "now" so one change moves Today
// membership, deadline states, recurrence occurrences, review ranges and
// completion/history timestamps together.
//
// It follows the system clock unless the review-only 预览时间 control sets an
// explicit value; clearing it restores the system clock exactly.
// ------------------------------------------------------------

let loopClockPreview = "";

/** True while the review-only preview time is driving the product. */
function loopClockIsPreview() {
  return loopClockPreview !== "";
}

/** The perceived now: the preview time when set, otherwise the system clock. */
function loopNow() {
  if (!loopClockPreview) return new Date();
  const date = new Date(loopClockPreview);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

/** Local date key (YYYY-MM-DD) of the perceived now. */
function loopTodayKey() {
  return localDateKey(loopNow());
}

/** 'YYYY-MM-DD HH:mm' of the perceived now — the timestamp history rows show. */
function loopStamp(at = loopNow()) {
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) return "";
  return `${localDateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Set the preview time from a 'YYYY-MM-DDTHH:mm' value. */
function loopSetPreviewClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  loopClockPreview = `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return true;
}

/** Back to the real clock. */
function loopClearPreviewClock() {
  loopClockPreview = "";
}

/** The preview value itself ('' when inactive), for the control's inputs. */
function loopClockValue() {
  return loopClockPreview;
}
