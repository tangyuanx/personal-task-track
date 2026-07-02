import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/frame.css";

const instances = new WeakMap();

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
        [Crepe.Feature.TopBar]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: placeholder,
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
