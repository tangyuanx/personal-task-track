# Personal Task Track

一个本地优先的个人任务流记录工具，面向程序员日常处理问题、拆解子任务、记录判断和沉淀结论的场景。

## 功能

- 左侧任务列表，支持按状态和优先级筛选。
- 右侧处理流，支持无限层级节点。
- 节点支持右键新增下级、同级、标记状态和删除。
- 任务包含背景、当前判断、结论。
- 节点详情支持 Markdown 注释，可记录图片、链接、代码块、表格等内容。
- 数据保存在本机应用存储中，不依赖云端服务。

## 开发

```bash
npm install
npm run dev
```

## 检查

```bash
npm run check
```

## 构建

macOS:

```bash
npm run dist:mac
```

Windows:

```bash
npm run dist:win
```

仓库内置 GitHub Actions。推送到 `main`、创建 `v*` 标签，或手动触发 workflow 后，会分别在 macOS 和 Windows runner 上构建桌面安装包，并上传为 workflow artifacts。

## 数据说明

当前版本使用浏览器本地存储作为应用数据存储。数据只保存在本机，不会上传到远程服务。
