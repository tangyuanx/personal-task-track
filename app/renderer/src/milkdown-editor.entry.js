import { Crepe } from "@milkdown/crepe";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { drawSelection, keymap } from "@codemirror/view";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { markRule } from "@milkdown/kit/prose";
import { TextSelection } from "@milkdown/kit/prose/state";
import { inlineCodeSchema, insertImageCommand } from "@milkdown/kit/preset/commonmark";
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
    placeholder = "记录处理过程",
    onChange,
    enableTableResizing = false,
    tableColumnWidths = [],
    onTableColumnWidthsChange,
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

    let lastMarkdown = markdown;
    let markdownTimer = 0;
    let tableColumnResizer = null;
    const emitMarkdown = () => {
      cancelScheduledIdle(markdownTimer, emitMarkdown);
      markdownTimer = 0;
      const nextMarkdown = crepe.getMarkdown();
      if (nextMarkdown === lastMarkdown) return nextMarkdown;
      lastMarkdown = nextMarkdown;
      onChange?.(nextMarkdown);
      return nextMarkdown;
    };
    const scheduleMarkdown = () => {
      cancelScheduledIdle(markdownTimer, emitMarkdown);
      markdownTimer = scheduleIdle(emitMarkdown);
    };
    crepe.on((listener) => {
      listener.updated(scheduleMarkdown);
      listener.updated(() => tableColumnResizer?.scheduleRefresh());
      listener.blur(emitMarkdown);
      listener.destroy(() => cancelScheduledIdle(markdownTimer, emitMarkdown));
    });

    await crepe.create();
    if (enableTableResizing) {
      tableColumnResizer = new MilkdownTableColumnResizer(root, tableColumnWidths, onTableColumnWidthsChange);
    }
    const instance = {
      getMarkdown: () => {
        cancelScheduledIdle(markdownTimer, emitMarkdown);
        markdownTimer = 0;
        return crepe.getMarkdown();
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
    return instance;
  }
}

window.MilkdownTaskEditor = MilkdownTaskEditor;
