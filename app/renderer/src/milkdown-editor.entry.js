import { Crepe } from "@milkdown/crepe";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { drawSelection, keymap } from "@codemirror/view";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { markRule } from "@milkdown/kit/prose";
import { TextSelection } from "@milkdown/kit/prose/state";
import { wrapIn } from "@milkdown/kit/prose/commands";
import { undo, redo } from "@milkdown/kit/prose/history";
import { inlineCodeSchema, insertImageCommand, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, wrapInHeadingCommand, wrapInBulletListCommand, wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand, insertHrCommand, liftListItemCommand } from "@milkdown/kit/preset/commonmark";
import { toggleStrikethroughCommand, insertTableCommand } from "@milkdown/kit/preset/gfm";
import { $inputRule } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/crepe/theme/common/code-mirror.css";
import "@milkdown/crepe/theme/common/cursor.css";
import "@milkdown/crepe/theme/common/image-block.css";
import "@milkdown/crepe/theme/common/link-tooltip.css";
import "@milkdown/crepe/theme/common/list-item.css";
import "@milkdown/crepe/theme/common/placeholder.css";
import "@milkdown/crepe/theme/common/table.css";
import "@milkdown/crepe/theme/common/toolbar.css";
import "@milkdown/crepe/theme/common/top-bar.css";

const instances = new WeakMap();
const completeInlineCodeInputRule = $inputRule((ctx) =>
  markRule(/(`+)([^`\n]+)\1$/, inlineCodeSchema.type(ctx)),
);

/**
 * Serialization counters, exposed for the switch-performance harness. A cached
 * hit must never grow `serializations`, which is what the handoff document
 * requires when asserting that unchanged notes stop re-serializing.
 */
const milkdownMetrics = {
  serializations: 0,
  cacheHits: 0,
  mounts: 0,
  resets() {
    this.serializations = 0;
    this.cacheHits = 0;
    this.mounts = 0;
  },
};
window.__loopMilkdownMetrics = milkdownMetrics;

const TABLE_COLUMN_MIN_WIDTH = 80;

function normalizedTableColumnWidths(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 64).map((table) => {
    if (!Array.isArray(table) || table.length < 2 || table.length > 32) return [];
    const widths = table.map((width) => Math.round(Number(width)));
    return widths.every((width) => Number.isFinite(width) && width >= TABLE_COLUMN_MIN_WIDTH && width <= 1600)
      ? widths
      : [];
  });
}

class MilkdownTableColumnResizer {
  constructor(root, layouts, onChange) {
    this.root = root;
    this.layouts = normalizedTableColumnWidths(layouts);
    this.onChange = onChange;
    this.frame = 0;
    this.drag = null;
    this.resizeObserver = new ResizeObserver(() => this.scheduleRefresh());
    this.resizeObserver.observe(root);
    this.refresh();
  }

  scheduleRefresh() {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.refresh();
    });
  }

  tables() {
    return Array.from(this.root.querySelectorAll(".milkdown-table-block .table-wrapper > table.children"));
  }

  columnCount(table) {
    const row = table.rows[0];
    if (!row) return 0;
    return Array.from(row.cells).reduce((count, cell) => count + Math.max(1, Number(cell.colSpan) || 1), 0);
  }

  currentWidths(table) {
    const row = table.rows[0];
    if (!row) return [];
    return Array.from(row.cells).map((cell) => Math.round(cell.getBoundingClientRect().width));
  }

  ensureColgroup(table, count) {
    let colgroup = table.querySelector(":scope > colgroup.loop-table-colgroup");
    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      colgroup.className = "loop-table-colgroup";
      colgroup.setAttribute("contenteditable", "false");
      table.insertBefore(colgroup, table.firstChild);
    }
    while (colgroup.children.length < count) colgroup.appendChild(document.createElement("col"));
    while (colgroup.children.length > count) colgroup.lastElementChild?.remove();
    return colgroup;
  }

  applyWidths(table, widths) {
    if (!table || widths.length < 2) return;
    const normalized = widths.map((width) => Math.max(TABLE_COLUMN_MIN_WIDTH, Math.round(width)));
    const colgroup = this.ensureColgroup(table, normalized.length);
    Array.from(colgroup.children).forEach((col, index) => {
      col.style.width = `${normalized[index]}px`;
    });
    const total = normalized.reduce((sum, width) => sum + width, 0);
    table.style.width = `${total}px`;
    table.style.minWidth = `${total}px`;
    table.classList.add("loop-table-sized");
  }

  clearWidths(table) {
    table.querySelector(":scope > colgroup.loop-table-colgroup")?.remove();
    table.style.removeProperty("width");
    table.style.removeProperty("min-width");
    table.classList.remove("loop-table-sized");
  }

  persistLayout(tableIndex, widths) {
    this.layouts[tableIndex] = Array.isArray(widths) ? widths.map((width) => Math.round(width)) : [];
    while (this.layouts.length && this.layouts[this.layouts.length - 1].length === 0) this.layouts.pop();
    this.onChange?.(this.layouts.map((layout) => layout.slice()));
  }

  resetTable(table, tableIndex) {
    this.clearWidths(table);
    this.persistLayout(tableIndex, []);
    this.scheduleRefresh();
  }

  positionHandles(table, layer) {
    const row = table.rows[0];
    if (!row) return;
    const tableRect = table.getBoundingClientRect();
    const cells = Array.from(row.cells);
    const handles = Array.from(layer.children);
    handles.forEach((handle, index) => {
      const cell = cells[index];
      if (!cell) return;
      handle.style.left = `${cell.getBoundingClientRect().right - tableRect.left}px`;
    });
    layer.style.left = `${table.offsetLeft}px`;
    layer.style.top = `${table.offsetTop}px`;
    layer.style.width = `${table.offsetWidth}px`;
    layer.style.height = `${table.offsetHeight}px`;
  }

  makeHandle(table, tableIndex, boundaryIndex) {
    const handle = document.createElement("div");
    handle.className = "loop-table-resize-handle";
    handle.setAttribute("contenteditable", "false");
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", `调整第 ${boundaryIndex + 1} 列宽度`);
    handle.tabIndex = 0;

    const start = (event) => {
      if (event.button !== 0) return;
      const widths = this.currentWidths(table);
      if (widths.length < 2 || boundaryIndex >= widths.length - 1) return;
      this.drag = {
        pointerId: event.pointerId,
        table,
        tableIndex,
        boundaryIndex,
        startX: event.clientX,
        widths,
      };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("active");
      table.classList.add("loop-table-resizing");
      event.preventDefault();
      event.stopPropagation();
    };

    const move = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const { widths, startX } = this.drag;
      const leftStart = widths[boundaryIndex];
      const rightStart = widths[boundaryIndex + 1];
      const available = leftStart + rightStart;
      const left = Math.min(available - TABLE_COLUMN_MIN_WIDTH, Math.max(TABLE_COLUMN_MIN_WIDTH, leftStart + event.clientX - startX));
      const next = widths.slice();
      next[boundaryIndex] = left;
      next[boundaryIndex + 1] = available - left;
      this.applyWidths(table, next);
      handle.dataset.width = `${Math.round(left)} px`;
      this.positionHandles(table, handle.parentElement);
      event.preventDefault();
      event.stopPropagation();
    };

    const finish = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const finalWidths = this.currentWidths(table);
      handle.releasePointerCapture?.(event.pointerId);
      handle.classList.remove("active");
      delete handle.dataset.width;
      table.classList.remove("loop-table-resizing");
      this.drag = null;
      this.persistLayout(tableIndex, finalWidths);
      event.preventDefault();
      event.stopPropagation();
    };

    handle.addEventListener("pointerdown", start);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("dblclick", (event) => {
      this.resetTable(table, tableIndex);
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("keydown", (event) => {
      if (event.key === "Home") {
        this.resetTable(table, tableIndex);
        event.preventDefault();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const widths = this.currentWidths(table);
      const leftStart = widths[boundaryIndex];
      const rightStart = widths[boundaryIndex + 1];
      const available = leftStart + rightStart;
      const step = (event.shiftKey ? 24 : 8) * (event.key === "ArrowRight" ? 1 : -1);
      const left = Math.min(available - TABLE_COLUMN_MIN_WIDTH, Math.max(TABLE_COLUMN_MIN_WIDTH, leftStart + step));
      widths[boundaryIndex] = left;
      widths[boundaryIndex + 1] = available - left;
      this.applyWidths(table, widths);
      this.persistLayout(tableIndex, widths);
      this.scheduleRefresh();
      event.preventDefault();
      event.stopPropagation();
    });
    return handle;
  }

  refresh() {
    this.tables().forEach((table, tableIndex) => {
      const count = this.columnCount(table);
      if (count < 2) return;
      const saved = this.layouts[tableIndex];
      if (!table.classList.contains("loop-table-sized") && saved?.length === count) this.applyWidths(table, saved);

      const wrapper = table.parentElement;
      if (!wrapper) return;
      wrapper.classList.add("loop-table-resizable");
      let layer = wrapper.querySelector(":scope > .loop-table-resize-layer");
      if (!layer) {
        layer = document.createElement("div");
        layer.className = "loop-table-resize-layer";
        layer.setAttribute("contenteditable", "false");
        wrapper.appendChild(layer);
      }
      if (layer.children.length !== count - 1) {
        layer.replaceChildren(...Array.from({ length: count - 1 }, (_, boundaryIndex) => this.makeHandle(table, tableIndex, boundaryIndex)));
      }
      this.positionHandles(table, layer);
    });
  }

  destroy() {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.root.querySelectorAll(".loop-table-resize-layer").forEach((layer) => layer.remove());
    this.drag = null;
  }
}

function scheduleIdle(callback) {
  const timer = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") {
      callback.idleId = window.requestIdleCallback(callback, { timeout: 500 });
      return;
    }
    callback();
  }, 320);
  return timer;
}

function cancelScheduledIdle(timer, callback) {
  window.clearTimeout(timer);
  if (callback.idleId && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(callback.idleId);
  }
  callback.idleId = 0;
}

function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error || new Error("Failed to read image file.")), { once: true });
    reader.readAsDataURL(file);
  });
}

class MilkdownTaskEditor {
  static async create({
    root,
    markdown = "",
    sourceMarkdown = markdown,
    placeholder = "记录处理过程",
    onChange,
    enableTableResizing = false,
    tableColumnWidths = [],
    onTableColumnWidthsChange,
    onSelectionChange,
  }) {
    if (!root) throw new Error("Milkdown root element is required.");
    const current = instances.get(root);
    if (current) await current.destroy();
    root.innerHTML = "";

    const crepe = new Crepe({
      root,
      defaultValue: markdown,
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.Toolbar]: false,
      },
      featureConfigs: {
        // Use the native caret. The virtual caret measured from the wrong
        // positioned ancestor in the prototype and painted a second cursor.
        [Crepe.Feature.Cursor]: { virtual: false },
        [Crepe.Feature.Placeholder]: {
          text: placeholder,
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: imageFileToDataUrl,
        },
      },
    });

    crepe.editor
      .config((ctx) => {
        ctx.update(codeBlockConfig.key, (config) => ({
          ...config,
          extensions: [drawSelection(), keymap.of(defaultKeymap.concat(indentWithTab))],
        }));
      })
      .use(completeInlineCodeInputRule);

    let lastMarkdown = sourceMarkdown;
    const savedAssetReferences = new Map();
    const applySavedAssetReferences = (value) => {
      let next = value;
      for (const [source, relativePath] of savedAssetReferences) next = next.split(source).join(relativePath);
      return next;
    };
    let originalDoc = null;
    let ready = false;
    let markdownTimer = 0;
    let tableColumnResizer = null;
    // Serialization cache. ProseMirror hands out a new immutable document
    // object on every document-changing transaction, so the document identity
    // is a reliable change signal. Selection, focus and decoration updates
    // reuse the same document and therefore stay cached.
    let serializedDoc = null;
    let serializedMarkdown = null;

    /**
     * Read the live document without serializing it. Reading EditorView state
     * is a property access, which keeps this usable on every navigation even
     * for a hidden, long document.
     */
    const currentDoc = () => {
      try {
        return crepe.editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
      } catch {
        return null;
      }
    };

    /**
     * Latest Markdown for the editor's current content. Returns the cached
     * text while the document has not changed, and only then falls back to a
     * full Crepe serialization.
     */
    const currentMarkdown = () => {
      const doc = currentDoc();
      if (doc && doc === serializedDoc && serializedMarkdown !== null) {
        milkdownMetrics.cacheHits += 1;
        return serializedMarkdown;
      }
      // Opening an editor must preserve the source bytes. Parsing/serializing
      // Markdown (and hydrating images) is not a user edit. ProseMirror's
      // structural comparison also recognizes undo back to the loaded note.
      if (originalDoc && doc && doc.eq(originalDoc)) {
        serializedDoc = doc;
        serializedMarkdown = sourceMarkdown;
        return sourceMarkdown;
      }
      const nextMarkdown = applySavedAssetReferences(crepe.getMarkdown());
      milkdownMetrics.serializations += 1;
      serializedDoc = doc;
      serializedMarkdown = nextMarkdown;
      return nextMarkdown;
    };

    const emitMarkdown = () => {
      cancelScheduledIdle(markdownTimer, emitMarkdown);
      markdownTimer = 0;
      if (!ready) return sourceMarkdown;
      const nextMarkdown = currentMarkdown();
      if (nextMarkdown === lastMarkdown) return nextMarkdown;
      lastMarkdown = nextMarkdown;
      onChange?.(nextMarkdown);
      return nextMarkdown;
    };
    const scheduleMarkdown = () => {
      if (!ready) return;
      cancelScheduledIdle(markdownTimer, emitMarkdown);
      markdownTimer = scheduleIdle(emitMarkdown);
    };
    crepe.on((listener) => {
      listener.updated(scheduleMarkdown);
      listener.updated(() => tableColumnResizer?.scheduleRefresh());
      // Listener callbacks run before EditorView has committed its new state.
      listener.updated(() => queueMicrotask(() => onSelectionChange?.()));
      listener.selectionUpdated(() => queueMicrotask(() => onSelectionChange?.()));
      listener.blur(emitMarkdown);
      listener.destroy(() => cancelScheduledIdle(markdownTimer, emitMarkdown));
    });

    await crepe.create();
    originalDoc = currentDoc();
    serializedDoc = originalDoc;
    serializedMarkdown = sourceMarkdown;
    ready = true;
    if (enableTableResizing) {
      tableColumnResizer = new MilkdownTableColumnResizer(root, tableColumnWidths, onTableColumnWidthsChange);
    }
    const instance = {
      format: (action, value) => crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const commands = { bold: toggleStrongCommand, italic: toggleEmphasisCommand, strike: toggleStrikethroughCommand, inline: toggleInlineCodeCommand, heading: wrapInHeadingCommand, bullet: wrapInBulletListCommand, ordered: wrapInOrderedListCommand, quote: wrapInBlockquoteCommand, code: createCodeBlockCommand, rule: insertHrCommand, table: insertTableCommand };
        let result = false;
        if (action === 'undo' || action === 'redo') result = (action === 'undo' ? undo : redo)(view.state, view.dispatch);
        else if (action === 'link') {
          const mark = view.state.schema.marks.link;
          if (!view.state.selection.empty) {
            const { from, to } = view.state.selection;
            view.dispatch(view.state.tr.addMark(from, to, mark.create({href:value}))); result = true;
          } else {
            const text = view.state.schema.text(value, [mark.create({href:value})]);
            view.dispatch(view.state.tr.replaceSelectionWith(text, false)); result = true;
          }
        } else if (action === 'bullet' || action === 'ordered') {
          const { $from } = view.state.selection;
          const current = Array.from({length:$from.depth}, (_, i) => i+1).reverse().find(d => ['bullet_list','ordered_list'].includes($from.node(d).type.name));
          if(current && $from.node(current).type.name === (action === 'bullet' ? 'bullet_list' : 'ordered_list')) result = ctx.get(commandsCtx).call(liftListItemCommand.key);
          else if(current) {const type=view.state.schema.nodes[action==='bullet'?'bullet_list':'ordered_list'];view.dispatch(view.state.tr.setNodeMarkup($from.before(current),type));result=true;}
          else result=ctx.get(commandsCtx).call(commands[action].key);
        } else if (action === 'task') {
          const type = view.state.schema.nodes.bullet_list;
          const before=view.state.selection.$from;
          const existing=Array.from({length:before.depth}, (_, i) => i+1).find(d=>before.node(d).type.name==='list_item');
          if(existing){const node=before.node(existing);view.dispatch(view.state.tr.setNodeMarkup(before.before(existing),undefined,{...node.attrs,checked:node.attrs.checked==null?false:null}));result=true;}
          else if (wrapIn(type)(view.state, view.dispatch)) {
            const tr = view.state.tr;
            const { $from, $to } = view.state.selection;
            const depth = Array.from({length:$from.depth}, (_, i) => i + 1).reverse().find(d => $from.node(d).type === type);
            if (depth) tr.doc.nodesBetween($from.before(depth), $to.after(depth), (node, pos) => { if(node.type.name === 'list_item') tr.setNodeMarkup(pos, undefined, {...node.attrs, checked:false}); });
            view.dispatch(tr); result = true;
          }
        } else if (commands[action]) result = ctx.get(commandsCtx).call(commands[action].key, value);
        view.focus(); onSelectionChange?.(); return result;
      }),
      getFormatState: () => crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx), { selection, schema, storedMarks } = view.state;
        const marks = storedMarks || selection.$from.marks();
        const active = {};
        for (const [name, type] of Object.entries({bold:'strong', italic:'emphasis', strike:'strike_through', inline:'inlineCode'})) {
          const mark = schema.marks[type]; active[name] = !!mark && (selection.empty ? marks.some(m => m.type === mark) : view.state.doc.rangeHasMark(selection.from, selection.to, mark));
        }
        active.heading = selection.$from.parent.type.name === 'heading' ? String(selection.$from.parent.attrs.level) : '0';
        active.undo = undo(view.state); active.redo = redo(view.state);
        return active;
      }),
      getMarkdown: () => {
        cancelScheduledIdle(markdownTimer, emitMarkdown);
        markdownTimer = 0;
        return currentMarkdown();
      },
      // Saving moves managed images to attachments. Rebase the source and
      // serializer together without replacing the document, selection or undo
      // history; the live editor must not resurrect the temporary references.
      acceptSavedAssetReferences: (assets = []) => {
        for (const asset of assets) {
          if (asset.source && asset.relativePath) savedAssetReferences.set(asset.source, asset.relativePath);
          if (asset.dataUrl && asset.relativePath) savedAssetReferences.set(asset.dataUrl, asset.relativePath);
        }
        const savedSource = (value) => applySavedAssetReferences(value).replace(/\r\n?/g, "\n");
        sourceMarkdown = savedSource(sourceMarkdown);
        lastMarkdown = savedSource(lastMarkdown);
        if (serializedMarkdown !== null) serializedMarkdown = savedSource(serializedMarkdown);
      },
      insertImage: ({ src, alt = "图片", title = "" }) =>
        crepe.editor.action((ctx) => ctx.get(commandsCtx).call(insertImageCommand.key, { src, alt, title })),
      getSelection: () =>
        crepe.editor.action((ctx) => {
          const selection = ctx.get(editorViewCtx).state.selection;
          return { anchor: selection.anchor, head: selection.head };
        }),
      restoreSelection: ({ anchor = 1, head = anchor } = {}) =>
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const maximum = view.state.doc.content.size;
          const safeAnchor = Math.max(0, Math.min(maximum, Number(anchor) || 0));
          const safeHead = Math.max(0, Math.min(maximum, Number(head) || safeAnchor));
          const selection = TextSelection.between(view.state.doc.resolve(safeAnchor), view.state.doc.resolve(safeHead));
          view.dispatch(view.state.tr.setSelection(selection));
          view.focus();
          return true;
        }),
      destroy: async () => {
        cancelScheduledIdle(markdownTimer, emitMarkdown);
        tableColumnResizer?.destroy();
        instances.delete(root);
        await crepe.destroy();
      },
    };
    instances.set(root, instance);
    milkdownMetrics.mounts += 1;
    return instance;
  }
}

window.MilkdownTaskEditor = MilkdownTaskEditor;
