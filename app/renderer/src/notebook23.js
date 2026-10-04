// ------------------------------------------------------------
// Phase23 · 知识笔记（身份入口 / 文档工具 / 页脚回执 / 待重试生命周期）
//
// Ported from the frozen Demo's loop-notebook-phase23.js. The Demo simulates
// files and recovery in the page session; here every receipt is driven by the
// real knowledge state (path / dirty / busy / issue) and the real save path.
// Pending association results follow the Demo's Pending Context Rule: a pending
// result belongs to its original path and saved baseline.
// ------------------------------------------------------------

const NOTE23_VIEWS = new Map();      // taskId -> {outline, find, query, heading}
const NOTE23_PENDING = new Map();    // taskId -> {path, baseline}
const NOTE23_PARTIAL = new Map();
const NOTE23_EXTERNAL = new Set();
const NOTE23_FAILURE = new Map();     // taskId -> the real failure message to show nearby     // tasks whose bound file changed underneath the note
const NOTE23_EDIT_DIRTY = new Set();   // tasks whose editor text differs from the saved snapshot
const NOTE23_SAVED_TEXT = new Map();
const NOTE23_BASELINE_CHECKED = new Set();
const NOTE23_DETAILS_DISMISS = new Map();   // taskId -> the details popover dismiss handler   // tasks whose on-disk baseline was verified   // taskId -> the text a completed write confirmed    // taskId -> {snapshot, path}: a real write whose binding did not land
let note23Matches = [];
let note23Index = -1;
let note23Frame = 0;

function note23Task() {
  return typeof shellActiveTask === "function" ? shellActiveTask() : state.tasks.find((t) => t.id === state.activeTaskId) || null;
}

function note23State(task) {
  if (!task) return null;
  const note = task.knowledgeNote && typeof task.knowledgeNote === "object" ? task.knowledgeNote : null;
  const base = (typeof shellKnowledgeState === "function" ? shellKnowledgeState(task) : null)
    || (typeof knowledgeFor === "function" ? knowledgeFor(task) : null)
    || {};
  // The product keeps a note's binding on task.knowledgeNote (filePath, dirty,
  // documentState); the accessor alone does not always expose it yet.
  return {
    ...base,
    path: note?.filePath || base.path || "",
    dirty: note?.dirty ?? base.dirty ?? false,
    state: note?.documentState || base.state || null,
    savedAt: base.savedAt || "",
    saved: base.saved ?? note?.lastSavedContent,
  };
}

function note23View(task) {
  if (!NOTE23_VIEWS.has(task.id)) NOTE23_VIEWS.set(task.id, { outline: false, find: false, query: "", heading: -1 });
  return NOTE23_VIEWS.get(task.id);
}

/** ATX headings 1..6, ignoring fenced code, with their markdown offsets. */
function note23Headings(md) {
  let offset = 0;
  let fence = "";
  const found = [];
  for (const line of String(md || "").split("\n")) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = "";
    } else if (!fence) {
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) found.push({ level: heading[1].length, text: heading[2].replace(/[*`]/g, ""), offset });
    }
    offset += line.length + 1;
  }
  return found;
}

function note23FileName(task, k) {
  if (k?.path) return String(k.path).split(/[\\/]/).at(-1);
  const first = note23Headings(task?.notes)[0];
  return first?.text || "未命名笔记";
}

/** Real-time draft state: the Demo marks a note dirty on input; the product only
 *  syncs on render/leave, so the layer keeps that state honest while typing. */
function note23IsDirty(task, k) {
  // Once this layer knows the confirmed snapshot, its own verdict wins: the
  // product's dirty flag only refreshes when the product captures the draft.
  if (task && NOTE23_SAVED_TEXT.has(task.id)) return NOTE23_EDIT_DIRTY.has(task.id);
  return Boolean(k?.dirty);
}

function note23EditorText() {
  const host = document.querySelector(".ProseMirror");
  if (host) return host.textContent || "";
  const source = document.querySelector("#knowledge-source");
  if (source) return source.value || "";
  return "";
}

/** Typing marks the note unsaved at once (the Demo's input semantics), without
 *  re-rendering the editor under the caret. The chrome is updated in place. */
function note23TrackEditorInput(task) {
  if (!task) return;
  const had = NOTE23_EDIT_DIRTY.has(task.id);
  NOTE23_EDIT_DIRTY.add(task.id);
  if (!had) note23UpdateChrome(task);
}

/** After the product has captured the draft (render/leave), compare Markdown with
 *  the confirmed snapshot: equal means the edit returned to the saved version. */
function note23EvaluateDraft(task) {
  if (!task) return;
  const saved = NOTE23_SAVED_TEXT.get(task.id)
    ?? (typeof task.knowledgeNote?.content === "string" && task.knowledgeNote.content
      ? task.knowledgeNote.content
      : null);
  if (saved === null) return;
  const differs = String(task.notes || "") !== saved;
  const had = NOTE23_EDIT_DIRTY.has(task.id);
  if (differs) NOTE23_EDIT_DIRTY.add(task.id);
  else NOTE23_EDIT_DIRTY.delete(task.id);
  if (differs !== had) render();   // one rebuild path only: the chrome cannot go stale
}

/** The product's persisted snapshot can come back empty after a restart, which makes
 *  a note that matches its file look unsaved. Verify against the file itself: only an
 *  exact hash match is treated as the saved baseline. */
/** Confirm that a reported success actually reached the bound file. */
async function note23ConfirmWriteLanded(task) {
  const note = task?.knowledgeNote;
  const api = window.personalTaskTrack?.knowledgeFile;
  if (!task || !note?.filePath || !note.lastSavedHash || !api?.read) return;
  let file;
  try {
    file = await api.read({ filePath: note.filePath });
  } catch (error) {
    return;
  }
  if (!file || file.success === false) return;
  // The product's own baseline can already have been moved to the external version
  // by its watcher, so hashes alone cannot decide: compare the actual file body
  // with what this note holds. A write that did not land must never claim success.
  const same = String(file.content ?? "").trim() === String(task.notes ?? "").trim();
  if (same) return;
  NOTE23_EXTERNAL.add(task.id);
  NOTE23_SAVED_TEXT.delete(task.id);
  NOTE23_EDIT_DIRTY.add(task.id);
  render();
}

async function note23VerifySavedBaseline(task) {
  const note = task?.knowledgeNote;
  if (!task || !note?.filePath || !note.lastSavedHash) return;
  if (NOTE23_SAVED_TEXT.has(task.id) || NOTE23_BASELINE_CHECKED.has(task.id)) return;
  const api = window.personalTaskTrack?.knowledgeFile;
  if (!api?.read) return;
  const productDirty = note.dirty === true || note.documentState === "DIRTY";
  if (!productDirty) return;
  NOTE23_BASELINE_CHECKED.add(task.id);
  let file;
  try {
    file = await api.read({ filePath: note.filePath });
  } catch (error) {
    NOTE23_BASELINE_CHECKED.delete(task.id);
    return;
  }
  if (!file || file.success === false) return;
  if (file.lastSavedHash !== note.lastSavedHash) return;
  if (String(file.content ?? "").trim() !== String(task.notes ?? "").trim()) return;
  NOTE23_SAVED_TEXT.set(task.id, String(task.notes || ""));
  NOTE23_EDIT_DIRTY.delete(task.id);
  render();
}

let note23ObservedHost = null;
let note23ObsTimer = 0;

/** Any editor mutation (typing, commands, undo/redo, paste) settles the draft:
 *  render once so the product captures it, then the render hook re-evaluates. */
function note23ObserveEditor() {
  const host = document.querySelector(".ProseMirror") || document.querySelector("#knowledge-source");
  if (!host || host === note23ObservedHost) return;
  note23ObservedHost = host;
  new MutationObserver(() => {
    const task = note23Task();
    if (!task || !NOTE23_EDIT_DIRTY.has(task.id)) return;
    window.clearTimeout(note23ObsTimer);
    note23ObsTimer = window.setTimeout(() => render(), 180);
  }).observe(host, { childList: true, characterData: true, subtree: true });
}

/** Surgical chrome refresh: receipt, dot and the footer button, no shell render. */
function note23UpdateChrome(task) {
  if (!task || state.taskPane !== "notes") return;
  const pane = document.querySelector(".knowledge-pane");
  if (!pane) return;
  if (pane.dataset.taskId && pane.dataset.taskId !== String(task.id)) return;
  const k = note23State(task);
  if (!k) return;
  const dirtyNow = note23IsDirty(task, k);
  const dot = pane.querySelector(".note23-dirty");
  const name = pane.querySelector(".note23-filename");
  if (dirtyNow && name && !dot) name.insertAdjacentHTML("beforeend", '<i class="note23-dirty" aria-label="尚未保存的修改"></i>');
  if (!dirtyNow) dot?.remove();
  const partialNow = Boolean(note23PartialOf(task, k)) || NOTE23_PENDING.has(task.id);
  const attentionNow = note23Attention(k) || partialNow || NOTE23_EXTERNAL.has(task.id);
  const receipt = pane.querySelector("[data-note23-receipt]");
  if (receipt) {
    receipt.classList.toggle("attention", attentionNow);
    receipt.innerHTML = `${shellIcon(attentionNow ? "blocked" : k.busy ? "repeat" : dirtyNow || !k.path ? "note" : "check")}<span>${esc(note23Receipt(k, partialNow, dirtyNow))}</span>`;
  }
  const save = pane.querySelector("[data-note-save]");
  if (save) {
    save.disabled = Boolean(k.busy) || (!dirtyNow && Boolean(k.path) && !k.issue && !k.partial);
    save.innerHTML = `${shellIcon(k.busy ? "repeat" : "check")}${k.busy ? "保存中…" : partialNow ? "重试关联" : k.path ? "保存" : "保存为文件"}`;
  }
}

/** A partial result either reported by the product or observed at the save boundary. */
function note23PartialOf(task, k) {
  if (k?.partial) return k.partial;
  return NOTE23_PARTIAL.get(task?.id)?.snapshot || "";
}

function note23Attention(k) {
  return Boolean(k?.issue || k?.partial || ["EXTERNAL_CHANGED", "FILE_MISSING", "READ_ONLY"].includes(k?.state));
}

/** The footer's one normal receipt, driven by real state. */
function note23Receipt(k, partialNow = Boolean(k?.pending || k?.partial), dirtyNow = Boolean(k?.dirty)) {
  if (k?.busy) return "正在保存文件… · 可继续编辑";
  if (partialNow) return "文件已写入 · 关联记录待重试";
  if (note23Attention(k)) return "当前内容保留 · 文件尚未同步";
  if (!k?.path) return "本页草稿已保留 · 尚未保存为文件";
  if (dirtyNow) return "本页草稿已保留 · 修改尚未写入文件";
  return `已保存到文件${k?.savedAt ? ` · ${k.savedAt}` : ""}`;
}

function note23Reconcile(task, k) {
  const pending = NOTE23_PENDING.get(task?.id);
  if (!pending || !k) return;
  // Normalise both sides: an unbound note reports path null while the pending may
  // hold "". A layer-owned partial keeps its recovery content, so a merely idle
  // state must not retire it (the Demo's partial carries k.recovery for the same
  // reason).
  const currentPath = k.path ?? "";
  const pendingPath = pending.path ?? "";
  // v4: a stale retry expires when the path changed, the accepted baseline moved,
  // or the note came back clean with exactly the content that retry had captured
  // (a load superseded it). A merely idle state keeps its retry.
  const ownSnapshot = NOTE23_PARTIAL.get(task.id)?.snapshot ?? "";
  const cleanLoad = !k.busy && !k.dirty && !k.recovery && String(task.notes || "") === ownSnapshot;
  if (currentPath !== pendingPath || (k.saved !== undefined && k.saved !== pending.baseline) || cleanLoad) {
    NOTE23_PENDING.delete(task.id);
    NOTE23_PARTIAL.delete(task.id);
    k.partial = "";
  }
}

function note23MemoryPending(task, k) {
  if (k?.partial) NOTE23_PENDING.set(task.id, { path: k.path, baseline: k.saved });
}

/** Retry completes only the association result, then the accepted snapshot decides dirty. */
function note23RetryAssociation(task) {
  const own = NOTE23_PARTIAL.get(task?.id) || null;
  const pending = NOTE23_PENDING.get(task?.id);
  const k = note23State(task);
  if ((!pending && !own) || !k) return false;
  if (own) {
    k.saved = own.snapshot;
    NOTE23_PARTIAL.delete(task.id);
  } else {
    k.saved = k.partial;
    k.partial = "";
  }
  NOTE23_PENDING.delete(task.id);
  k.dirty = String(task.notes || "") !== String(k.saved || "");
  k.state = note23IsDirty(task, k) ? "DIRTY" : "SAVED";
  render();
  save();                       // the task's knowledgeFile/knowledgeNote binding is persisted for real
  return true;
}

function note23OutlineHTML(task) {
  const view = note23View(task);
  const list = note23Headings(task.notes);
  return `<aside class="note23-outline" aria-label="笔记大纲"><header><span>大纲</span><button class="icon-button" data-note23="outline" aria-label="收起大纲">${shellIcon("close")}</button></header><nav aria-label="篇内标题">${
    list.map((h, i) => `<button data-note23-heading="${i}" style="padding-left:${7 + Math.min(h.level - 1, 3) * 10}px" ${view.heading === i ? 'aria-current="location"' : ""}>${esc(h.text)}</button>`).join("") || "<p>暂无标题</p>"
  }</nav></aside>`;
}

/** Rebuild the phase23 chrome inside the freshly rendered knowledge pane. */
function note23Decorate() {
  // A bound note that the product reports as SAVED is authoritative: after a reload
  // the accepted snapshot is empty, which would otherwise be read as "unsaved".
  // Seeding it from the persisted body restores the real saved baseline.
  try {
    const t0 = note23Task();
    const k0 = t0 ? note23State(t0) : null;
    if (t0 && k0?.state === "SAVED" && String(t0.notes || "").trim() && !NOTE23_SAVED_TEXT.has(t0.id)) {
      NOTE23_SAVED_TEXT.set(t0.id, String(t0.notes || ""));
      NOTE23_EDIT_DIRTY.delete(t0.id);
    }
    if (t0) void note23VerifySavedBaseline(t0);
  } catch (error) { /* keep decorating */ }
  try {
    const pane0 = document.querySelector(".knowledge-pane");
    window.__d23 = (window.__d23 || []).concat([{
      hasTask: Boolean(note23Task()), paneFound: Boolean(pane0),
      paneTaskId: pane0?.dataset.taskId ?? null, activeTaskId: String(state.activeTaskId ?? ""),
      pane: state.taskPane ?? null, external: NOTE23_EXTERNAL.size, failure: NOTE23_FAILURE.size,
    }]).slice(-8);
  } catch (error) { /* diagnostics only */ }
  if (state.taskPane !== "notes") return;
  const pane = document.querySelector(".knowledge-pane");
  const task = note23Task();
  if (!pane || !task) return;
  if (pane.dataset.taskId && pane.dataset.taskId !== String(task.id)) return;
  const k = note23State(task);
  if (!k) return;
  note23Reconcile(task, k);
  note23MemoryPending(task, k);
  const view = note23View(task);

  // identity: filename + 5px unsaved marker
  const meta = pane.querySelector(".knowledge-file-meta");
  if (meta && !meta.querySelector(".note23-filename")) {
    meta.outerHTML = `<div class="note23-identity"><button class="note23-filename" data-note23="file-info" aria-label="笔记文件信息" aria-haspopup="dialog" aria-expanded="false" title="${escAttr(k.path || "未关联文件的草稿")}">${shellIcon("note")}<span>${esc(note23FileName(task, k))}</span>${note23IsDirty(task, k) ? '<i class="note23-dirty" aria-label="尚未保存的修改"></i>' : ""}</button></div>`;
  } else {
    const name = pane.querySelector(".note23-filename");
    if (name) {
      name.title = k.path || "未关联文件的草稿";
      const label = name.querySelector("span");
      if (label) label.textContent = note23FileName(task, k);
      const dirtyNow = note23IsDirty(task, k);
      const dot = name.querySelector(".note23-dirty");
      if (dirtyNow && !dot) name.insertAdjacentHTML("beforeend", '<i class="note23-dirty" aria-label="尚未保存的修改"></i>');
      if (!dirtyNow) dot?.remove();
    }
  }

  // document tools before the presentation actions
  const actions = pane.querySelector(".knowledge-header-actions");
  if (actions && !actions.querySelector(".note23-tools")) {
    actions.insertAdjacentHTML("afterbegin", `<div class="note23-tools" role="group" aria-label="文档工具"><button class="icon-button" data-note23="find" aria-label="在笔记中查找" title="在笔记中查找 · ⌘ / Ctrl + F" aria-pressed="${view.find}">${shellIcon("search")}</button><button class="icon-button" data-note23="outline" aria-label="笔记大纲" title="笔记大纲" aria-pressed="${view.outline}">${shellIcon("note23Outline")}</button></div>`);
  }

  // find bar
  const body = pane.querySelector(".knowledge-body");
  const existingFind = pane.querySelector(".note23-find");
  if (view.find && body && !existingFind) {
    body.insertAdjacentHTML("beforebegin", `<div class="note23-find" role="search" aria-label="笔记内查找"><input id="note23-query" aria-label="查找笔记文字" placeholder="在当前笔记中查找" value="${escAttr(view.query)}" autocomplete="off"><output id="note23-match-count" aria-live="polite"></output><button class="icon-button" data-note23="find-prev" aria-label="上一个匹配">${shellIcon("chevron")}</button><button class="icon-button" data-note23="find-next" aria-label="下一个匹配">${shellIcon("chevron")}</button><button class="icon-button" data-note23="find" aria-label="关闭笔记查找">${shellIcon("close")}</button></div>`);
    const previous = document.querySelector(".note23-find [data-note23='find-prev'] svg");
    previous?.style.setProperty("transform", "rotate(180deg)");
  } else if (!view.find) {
    existingFind?.remove();
    CSS.highlights?.delete("note23-matches");
    CSS.highlights?.delete("note23-current");
  }

  // partial: the file was written but the association record was not saved
  const pendingNow = Boolean(note23PartialOf(task, k)) || NOTE23_PENDING.has(task.id);
  const noticeHost = pane.querySelector(".note23-content") || pane;
  const externalNow = NOTE23_EXTERNAL.has(task.id);
  const existingNotice = noticeHost.querySelector("[data-note23-partial]");
  if (pendingNow && !existingNotice) {
    noticeHost.insertAdjacentHTML("afterbegin", `<div class="knowledge-notice attention" role="status" data-note23-partial><span>${shellIcon("blocked")}文件已写入，但关联记录未保存。恢复草稿仍保留。</span><div><button class="text-button" data-note23="retry-partial">重试关联</button><button class="text-button" data-knowledge-action="save-as">另存为</button></div></div>`);
  } else if (!pendingNow) {
    existingNotice?.remove();
  }
  const failureNotice = noticeHost.querySelector("[data-note23-failure]");
  const failureNow = NOTE23_FAILURE.get(task.id);
  if (failureNow && (!failureNotice || failureNotice.dataset.message !== failureNow)) {
    failureNotice?.remove();
    noticeHost.insertAdjacentHTML("afterbegin", `<div class="knowledge-notice attention" role="status" data-note23-failure data-message="${escAttr(failureNow)}"><span>${shellIcon("blocked")}${esc(failureNow)}</span><div><button class="text-button" data-note23="retry-save">重试保存</button><button class="text-button" data-note23="save-as-external">另存为</button></div></div>`);
  } else if (!failureNow) {
    failureNotice?.remove();
  }
  const externalNotice = noticeHost.querySelector("[data-note23-external]");
  // The product reports the sync problem itself (issue/external state) as well as
  // this layer observing a write that did not land: both must offer the choices.
  const externalNoticeNeeded = externalNow || Boolean(note23Attention(k));
  if (externalNoticeNeeded && !externalNotice) {
    noticeHost.insertAdjacentHTML("afterbegin", `<div class="knowledge-notice attention" role="status" data-note23-external><span>${shellIcon("blocked")}文件已被外部修改，请先重新加载、明确覆盖或另存为。</span><div><button class="text-button" data-note23="overwrite">明确覆盖</button><button class="text-button" data-note23="save-as-external">另存为</button></div></div>`);
  } else if (!externalNoticeNeeded) {
    externalNotice?.remove();
  }

  // content wrapper + optional outline
  if (body && !pane.querySelector(".note23-content")) {
    const content = document.createElement("div");
    content.className = "note23-content";
    body.before(content);
    content.append(body);
  }
  const content = pane.querySelector(".note23-content");
  const outline = pane.querySelector(".note23-outline");
  if (view.outline && content && !outline) content.insertAdjacentHTML("beforeend", note23OutlineHTML(task));
  else if (view.outline && outline && outline.outerHTML !== note23OutlineHTML(task)) outline.outerHTML = note23OutlineHTML(task);
  else if (!view.outline) outline?.remove();

  // one footer receipt (a real partial result counts as attention)
  const partialNow = Boolean(note23PartialOf(task, k)) || NOTE23_PENDING.has(task.id);
  const attentionNow = note23Attention(k) || partialNow || externalNow;
  const receiptIcon = attentionNow ? "blocked" : k.busy ? "repeat" : note23IsDirty(task, k) || !k.path ? "note" : "check";
  const footer = pane.querySelector(".knowledge-footer");
  if (footer && !footer.querySelector("[data-note23-receipt]")) {
    footer.insertAdjacentHTML("afterbegin", `<div class="note23-receipt ${attentionNow ? "attention" : ""}" role="status" data-note23-receipt>${shellIcon(receiptIcon)}<span>${esc(note23Receipt(k, partialNow, note23IsDirty(task, k)))}</span></div>`);
  } else {
    const receipt = footer?.querySelector("[data-note23-receipt]");
    if (receipt) {
      receipt.classList.toggle("attention", attentionNow);
      receipt.innerHTML = `${shellIcon(receiptIcon)}<span>${esc(note23Receipt(k, partialNow, note23IsDirty(task, k)))}</span>`;
    }
  }
  // the Demo removes the duplicated recovery strip; the real recovery stays in its notice
  document.querySelectorAll(".knowledge-pane [data-note-recovery]").forEach((el) => el.remove());

  const save = pane.querySelector("[data-note-save]");
  if (save) {
    save.disabled = Boolean(k.busy) || (!note23IsDirty(task, k) && Boolean(k.path) && !k.issue && !k.partial);
    save.innerHTML = `${shellIcon(k.busy ? "repeat" : "check")}${k.busy ? "保存中…" : note23PartialOf(task, k) || NOTE23_PENDING.has(task.id) ? "重试关联" : k.path ? "保存" : "保存为文件"}`;
  }
  note23RefreshOutline(task);
  note23RefreshFind(false);
  note23ObserveEditor();
}

function note23RefreshOutline(task) {
  const aside = document.querySelector(".note23-outline");
  if (!aside || !task) return;
  const html = note23OutlineHTML(task);
  if (aside.outerHTML !== html) aside.outerHTML = html;
}

/** Source: native selection; rich/preview: CSS Highlight ranges (never written). */
function note23RefreshFind(navigate = true, direction = 0) {
  const bar = document.querySelector(".note23-find");
  if (!bar) return;
  const query = document.querySelector("#note23-query")?.value.toLocaleLowerCase() ?? "";
  const source = document.querySelector("#knowledge-source");
  const root = document.querySelector(".ProseMirror") || document.querySelector(".knowledge-preview");
  let text = "";
  const parts = [];
  if (source) text = source.value;
  else if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement.closest('button,[contenteditable="false"],.cm-gutters') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let node;
    let block;
    while ((node = walker.nextNode())) {
      const current = node.parentElement.closest("p,h1,h2,h3,h4,h5,h6,pre,li,td,th");
      if (block && current !== block) text += "\n";
      block = current;
      parts.push({ node, start: text.length });
      text += node.data;
    }
  }
  const matches = [];
  if (query) {
    const hay = text.toLocaleLowerCase();
    let at = hay.indexOf(query);
    while (at >= 0) { matches.push(at); at = hay.indexOf(query, at + query.length); }
  }
  if (direction) note23Index = matches.length ? (note23Index + direction + matches.length) % matches.length : -1;
  else note23Index = matches.length ? Math.min(Math.max(note23Index, 0), matches.length - 1) : -1;
  const count = document.querySelector("#note23-match-count");
  if (count) count.textContent = query ? (matches.length ? `${note23Index + 1} / ${matches.length}` : "无匹配") : "输入查找文字";
  bar.querySelectorAll('[data-note23="find-next"],[data-note23="find-prev"]').forEach((button) => { button.disabled = !matches.length; });
  note23Matches = [];
  if (source) {
    if (navigate && note23Index >= 0) {
      source.setSelectionRange(matches[note23Index], matches[note23Index] + query.length);
      source.scrollTop = (matches[note23Index] / Math.max(1, text.length)) * source.scrollHeight;
    }
    return;
  }
  if (!parts.length) return;
  for (const at of matches.slice(0, 500)) {
    const first = parts.findLast((p) => p.start <= at);
    const last = parts.findLast((p) => p.start < at + query.length);
    if (!first || !last) continue;
    const range = document.createRange();
    range.setStart(first.node, at - first.start);
    range.setEnd(last.node, Math.min(last.node.length, at + query.length - last.start));
    note23Matches.push(range);
  }
  if (typeof Highlight === "function" && CSS.highlights) {
    CSS.highlights.set("note23-matches", new Highlight(...note23Matches));
    CSS.highlights.set("note23-current", new Highlight(...(note23Matches[note23Index] ? [note23Matches[note23Index]] : [])));
  }
  if (navigate && note23Index >= 0) {
    const part = parts.findLast((p) => p.start <= matches[note23Index]);
    part?.node.parentElement.scrollIntoView({ block: "center", behavior: "auto" });
  }
}

function note23LocateHeading(index) {
  const task = note23Task();
  if (!task) return;
  const heading = note23Headings(task.notes)[index];
  if (!heading) return;
  note23View(task).heading = index;
  const source = document.querySelector("#knowledge-source");
  if (source) {
    source.focus();
    source.setSelectionRange(heading.offset, heading.offset);
    source.scrollTop = (heading.offset / Math.max(1, source.value.length)) * source.scrollHeight;
  } else {
    document.querySelector(".knowledge-body")?.querySelectorAll(".ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6,.knowledge-preview h1,.knowledge-preview h2,.knowledge-preview h3,.knowledge-preview h4,.knowledge-preview h5,.knowledge-preview h6")[index]?.scrollIntoView({ block: "start", behavior: "auto" });
  }
  note23RefreshOutline(task);
}

/** Closing a bound note with unsaved (or partial) work asks before losing state. */
const note23PriorCloseEditor = typeof closeKnowledgeEditor === "function" ? closeKnowledgeEditor : null;
if (note23PriorCloseEditor) {
  closeKnowledgeEditor = function note23CloseEditor() {
    const task = note23Task();
    const k = note23State(task);
    const pending = Boolean(task && NOTE23_PENDING.has(task.id));
    if (!task || !k || !k.path || (!note23IsDirty(task, k) && !k.partial && !pending)) return note23PriorCloseEditor();
    shellKnowledgeDialog(
      "关闭笔记",
      '<p class="knowledge-dialog-copy">当前修改尚未全部保存。保留草稿后可回来继续，文件版本保持不变。</p>',
      '<button class="button" data-action="close-dialog">继续编辑</button>'
      + '<button class="button" data-note23="close-keep-draft">保留草稿并关闭</button>'
      + '<button class="button primary" data-note23="close-save">保存并关闭</button>',
    );
  };
}

/**
 * The real save boundary. A file write that completes without the association
 * record landing is the phase's partial result: it must be shown as such, not
 * silently reported as nothing.
 */
const note23PriorSaveTask = typeof saveKnowledgeTask === "function" ? saveKnowledgeTask : null;

/** Confirm a partial on the next frame: a write that finishes without a binding. */
function note23VerifySaveBoundary(task, before, attempt = 0) {
  if (!task) return;
  const k = note23State(task);
  if (!k) return;
  if (k.path || !String(task.notes || "").trim()) {
    NOTE23_PARTIAL.delete(task.id);   // the binding landed (or there is nothing to bind)
    NOTE23_PENDING.delete(task.id);
    NOTE23_SAVED_TEXT.set(task.id, String(task.notes || ""));
    NOTE23_EDIT_DIRTY.delete(task.id);
    render();
    // A write the product reports as successful is only trusted when the file on
    // disk really carries the accepted hash; otherwise the refusal is surfaced.
    void note23ConfirmWriteLanded(task);
    // The product refreshes parts of the pane after a save; re-decorate once it has
    // settled so the footer receipt cannot be dropped by that refresh.
    window.setTimeout(() => note23Decorate(), 300);
    window.setTimeout(() => note23Decorate(), 900);
    return;
  }
  if (k.busy && attempt < 8) { requestAnimationFrame(() => note23VerifySaveBoundary(task, before, attempt + 1)); return; }
  NOTE23_PARTIAL.set(task.id, { snapshot: before.notes, path: k.path ?? "" });
  NOTE23_PENDING.set(task.id, { path: k.path ?? "", baseline: k.saved ?? before.notes });
  render();
}

if (note23PriorSaveTask) {
  saveKnowledgeTask = async function note23SaveTask(taskId, options = {}) {
    window.__note23SaveCalls = (window.__note23SaveCalls || 0) + 1;
    const task = state.tasks.find((item) => String(item.id) === String(taskId)) || note23Task();
    const before = task ? { notes: String(task.notes || ""), path: note23State(task)?.path || "" } : null;
    // The product reports these failures through a blocking alert; take it over so
    // the result can be presented near the document instead.
    const priorAlert = window.alert;
    const captured = [];
    window.alert = (message) => { captured.push(String(message)); };
    let outcome;
    try {
      outcome = await note23PriorSaveTask(taskId, options);
    } finally {
      window.alert = priorAlert;
    }
    if (!task || !before) return outcome;
    // The product updates task.knowledgeNote asynchronously after the write, so
    // judge on the next frame instead of synchronously (which produced a false
    // partial before).
    try {
      window.__out23 = { keys: outcome && typeof outcome === "object" ? Object.keys(outcome) : typeof outcome,
        success: outcome?.success ?? null, code: outcome?.code ?? null, canceled: outcome?.canceled ?? null,
        markdownSaved: outcome?.markdownSaved ?? null, message: String(outcome?.message || "").slice(0, 40),
        alert: String(captured[0] || "").slice(0, 50) };
    } catch (error) { /* diagnostics only */ }
    if (outcome && outcome.success === false && outcome.code === "EXTERNAL_CHANGE_REQUIRES_CONFIRMATION") {
      NOTE23_EXTERNAL.add(task.id);
      render();
      note23Decorate();
    } else if (outcome && outcome.success === false) {
      NOTE23_FAILURE.set(task.id, captured[0] || outcome.message || "知识笔记保存失败，请重试。");
      render();
      note23Decorate();
    } else if (outcome && outcome.success === true) {
      NOTE23_EXTERNAL.delete(task.id);
      NOTE23_FAILURE.delete(task.id);
    }
    // A cancelled dialog is not a write attempt: it must leave the note exactly as
    // it was (no pending association, no "file written" receipt).
    if (outcome && outcome.canceled === true) {
      NOTE23_PARTIAL.delete(task.id);
      NOTE23_PENDING.delete(task.id);
      NOTE23_EXTERNAL.delete(task.id);
      NOTE23_FAILURE.delete(task.id);
      render();
      return outcome;
    }
    if (outcome && outcome.success === false) return outcome;
    requestAnimationFrame(() => note23VerifySaveBoundary(task, before));
    return outcome;
  };
}

// ---- wiring: decorate after every render, keep the real save state visible ----
const note23PriorRender = render;
render = function note23Render() {
  CSS.highlights?.delete("note23-matches");
  CSS.highlights?.delete("note23-current");
  note23PriorRender();
  if (state.taskPane === "notes" && document.querySelector(".knowledge-pane")) {
    const foot = document.querySelector(".workspace-foot");
    if (foot) foot.innerHTML = "<span>知识笔记 · 本页预览</span><span>⌘ / Ctrl + S 保存文件</span>";
    cancelAnimationFrame(note23Frame);
    note23Frame = requestAnimationFrame(() => { const task = note23Task(); if (task) note23EvaluateDraft(task); note23Decorate(); });
  }
};

window.addEventListener("click", (event) => {
  // With a pending association result the footer button retries only that result
  // (it never pretends later edits were written).
  const saveButton = event.target.closest?.("[data-note-save]");
  if (saveButton) {
    const task = note23Task();
    if (task && NOTE23_PENDING.has(task.id)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      note23RetryAssociation(task);
      return;
    }
  }
  // Toolbar commands (bold, lists, undo/redo, …) change the draft without a shell
  // render and without an input event, so re-evaluate once the command has applied.
  const command = event.target.closest?.('[data-action="note-format"]');
  if (command) {
    const task = note23Task();
    if (task) {
      // An unbound draft has no confirmed snapshot to compare against, so any
      // command-driven change marks it unsaved at once (the Demo's semantics).
      if (!NOTE23_SAVED_TEXT.has(task.id)) note23TrackEditorInput(task);
      window.setTimeout(() => note23EvaluateDraft(task), 120);
      window.setTimeout(() => note23EvaluateDraft(task), 450);
    }
  }
  const heading = event.target.closest?.("[data-note23-heading]");
  if (heading) {
    event.preventDefault();
    event.stopImmediatePropagation();
    note23LocateHeading(Number(heading.dataset.note23Heading));
    return;
  }
  const button = event.target.closest?.("[data-note23]");
  if (!button) return;
  const action = button.dataset.note23;
  const task = note23Task();
  if (!task) return;
  const view = note23View(task);
  if (action === "file-info") {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (note23OpenDetails(task)) return;
    return;
  }
  if (action === "close-keep-draft") {
    event.preventDefault();
    event.stopImmediatePropagation();
    try { persistKnowledgeRecoveryRecord?.(task); } catch (error) { console.error("保留草稿失败", error); render(); return; }
    shellCloseOverlay?.();
    note23PriorCloseEditor?.();
    return;
  }
  if (action === "close-save") {
    event.preventDefault();
    event.stopImmediatePropagation();
    const finish = () => {
      const state2 = note23State(task);
      if (state2 && !state2.dirty && !state2.partial && !state2.busy) {
        shellCloseOverlay?.();
        note23PriorCloseEditor?.();
      } else {
        render();   // a write that failed or is still partial keeps the note open
      }
    };
    const outcome = saveKnowledgeTask?.(task.id, { saveAs: false });   // (id, options), not the task object
    if (outcome && typeof outcome.then === "function") outcome.then(finish).catch(() => render());
    else finish();
    return;
  }
  if (action === "retry-save") {
    event.preventDefault();
    event.stopImmediatePropagation();
    NOTE23_FAILURE.delete(task.id);
    render();
    void saveKnowledgeTask?.(task.id, { saveAs: false });
    return;
  }
  if (action === "overwrite") {
    event.preventDefault();
    event.stopImmediatePropagation();
    NOTE23_EXTERNAL.delete(task.id);
    render();
    void saveKnowledgeTask?.(task.id, { allowExternalOverwrite: true, saveAs: false });
    return;
  }
  if (action === "save-as-external") {
    event.preventDefault();
    event.stopImmediatePropagation();
    void saveKnowledgeTask?.(task.id, { saveAs: true });
    return;
  }
  if (action === "retry-partial") {
    event.preventDefault();
    event.stopImmediatePropagation();
    note23RetryAssociation(task);
    return;
  }
  if (action === "find-next" || action === "find-prev") {
    event.preventDefault();
    event.stopImmediatePropagation();
    note23RefreshFind(true, action === "find-next" ? 1 : -1);
    return;
  }
  if (action === "outline") {
    event.preventDefault();
    event.stopImmediatePropagation();
    view.outline = !view.outline;
    render();
    document.querySelector('.note23-tools [data-note23="outline"]')?.focus({ preventScroll: true });
    return;
  }
  if (action === "find") {
    event.preventDefault();
    event.stopImmediatePropagation();
    view.find = !view.find;
    render();
    if (view.find) document.querySelector("#note23-query")?.focus();
    else document.querySelector('.note23-tools [data-note23="find"]')?.focus({ preventScroll: true });
  }
}, true);

window.addEventListener("keyup", (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (!event.target.closest?.(".ProseMirror, .knowledge-rich-host, #knowledge-source")) return;
  const task = note23Task();
  if (task) note23EvaluateDraft(task);
}, true);

/** The Demo's 文件名信息浮层: a 360px dialog with a 74px label column. */
function note23OpenDetails(task) {
  const k = note23State(task);
  if (!task || !k || typeof shellMountSurface !== "function") return false;
  const images = (String(task.notes || "").match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;
  const rows = [
    ["名称", note23FileName(task, k)],
    ["路径", k.path || "未关联文件"],
    ["状态", note23Receipt(k, Boolean(note23PartialOf(task, k)) || NOTE23_PENDING.has(task.id), note23IsDirty(task, k))],
    ["格式", "Markdown · UTF-8"],
    ["图片引用", images ? images + " 项" : "0 项"],
  ];
  shellMountSurface(
    `<section class="surface-popover note23-details" role="dialog" aria-label="笔记文件信息" data-return-focus=".note23-filename" style="width: 360px;">
      <header class="dialog-head"><h2>笔记文件</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="关闭">${shellIcon("close")}</button></header>
      <dl>${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(String(value))}</dd>`).join("")}</dl>
      <p>图片附件与 Markdown 文件需要一同备份。解除关联会保留正文、文件与附件。</p>
      <footer><button class="button" data-note23="details-save-as">另存为</button></footer>
    </section>`,
    document.querySelector(".note23-filename"),
    360,
  );
  document.querySelector('[data-note23="details-save-as"]')?.addEventListener("click", () => {
    void saveKnowledgeTask?.(task.id, { saveAs: true });
  });
  // A click outside closes this popover and is consumed: it must not reach the
  // editor underneath (the Demo's surface behaves the same way).
  const onDown = (event) => {
    window.__note23DismissCalls = (window.__note23DismissCalls || 0) + 1;
    const pop = document.querySelector(".note23-details");
    if (!pop) { NOTE23_DETAILS_DISMISS.delete(task.id); return; }
    if (pop.contains(event.target) || event.target.closest?.(".note23-filename")) return;
    window.__note23Dismissed = (window.__note23Dismissed || 0) + 1;
    event.preventDefault();
    event.stopPropagation();
    shellCloseOverlay?.({ restoreFocus: false });
    render();
    NOTE23_DETAILS_DISMISS.delete(task.id);
    note23RestoreIdentityFocus();
  };
  for (const type of ["pointerdown", "mousedown", "click"]) document.addEventListener(type, onDown, true);
  NOTE23_DETAILS_DISMISS.set(task.id, onDown);
  return true;
}

/** The identity button owns the file menu, so focus returns to it when the menu or
 *  the file-info dialog closes (the product's own listeners leave focus elsewhere). */
function note23RestoreIdentityFocus() {
  window.setTimeout(() => {
    if (document.querySelector(".surface-popover, [role=\"dialog\"], .knowledge-dialog")) return;
    const button = document.querySelector(".note23-filename");
    if (!button) return;
    // A programmatic restore must not paint a focus ring (the Demo has none); any
    // real pointer or key interaction removes the suppression again.
    button.classList.add("note23-focus-quiet");
    button.focus();
    window.setTimeout(() => button.classList.remove("note23-focus-quiet"), 1200);
  }, 120);
}

document.addEventListener("click", (event) => {
  if (event.target.closest?.('[data-action="close-dialog"], [data-note23="file-info"]')) note23RestoreIdentityFocus();
}, true);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector(".surface-popover, .knowledge-dialog")) note23RestoreIdentityFocus();
}, true);

document.addEventListener("input", (event) => {
  if (event.target.id !== "note23-query") {
    // Only a real edit marks the note unsaved; a programmatic content swap (for
    // example an accepted external version) must not.
    if (event.isTrusted !== true) return;
    if (event.target.closest?.(".ProseMirror, .knowledge-rich-host, #knowledge-source")) note23TrackEditorInput(note23Task());
    return;
  }
  const task = note23Task();
  if (!task) return;
  note23View(task).query = event.target.value;
  note23Index = -1;
  note23RefreshFind(true);
});

window.addEventListener("keydown", (event) => {
  if (event.isComposing || event.keyCode === 229) return;
  if (state.taskPane !== "notes" || !document.querySelector(".knowledge-pane") || document.querySelector("#overlay").firstElementChild) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    event.stopImmediatePropagation();
    const task = note23Task();
    if (!task) return;
    note23View(task).find = true;
    render();
    const input = document.querySelector("#note23-query");
    input?.focus();
    input?.select();
    return;
  }
  if (event.target.id === "note23-query" && ["Enter", "Escape"].includes(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Enter") note23RefreshFind(true, event.shiftKey ? -1 : 1);
    else {
      const task = note23Task();
      if (task) note23View(task).find = false;
      render();
      document.querySelector('.note23-tools [data-note23="find"]')?.focus({ preventScroll: true });
    }
  }
}, true);
