import { Crepe } from "@milkdown/crepe";
import { commandsCtx } from "@milkdown/kit/core";
import { insertImageCommand } from "@milkdown/kit/preset/commonmark";
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

    let lastMarkdown = markdown;
    crepe.on((listener) => {
      listener.markdownUpdated((_, nextMarkdown) => {
        if (nextMarkdown === lastMarkdown) return;
        lastMarkdown = nextMarkdown;
        onChange?.(nextMarkdown);
      });
    });

    await crepe.create();
    const instance = {
      getMarkdown: () => crepe.getMarkdown(),
      insertImage: ({ src, alt = "图片", title = "" }) =>
        crepe.editor.action((ctx) => ctx.get(commandsCtx).call(insertImageCommand.key, { src, alt, title })),
      destroy: async () => {
        instances.delete(root);
        await crepe.destroy();
      },
    };
    instances.set(root, instance);
    return instance;
  }
}

window.MilkdownTaskEditor = MilkdownTaskEditor;
