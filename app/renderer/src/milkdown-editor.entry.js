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
  static async create({ root, markdown = "", placeholder = "记录处理过程", onChange }) {
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
      listener.blur(emitMarkdown);
      listener.destroy(() => cancelScheduledIdle(markdownTimer, emitMarkdown));
    });

    await crepe.create();
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
        instances.delete(root);
        await crepe.destroy();
      },
    };
    instances.set(root, instance);
    return instance;
  }
}

window.MilkdownTaskEditor = MilkdownTaskEditor;
