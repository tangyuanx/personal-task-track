# Personal Task Track

一个本地优先的个人任务流记录工具，面向程序员日常处理问题、拆解子任务、聚焦主线任务、跟踪处理过程、记录判断和沉淀结论的场景。

## 功能

- 左侧任务列表，支持按状态和优先级筛选。
- 右侧处理流，支持无限层级节点。
- 节点支持右键新增下级、同级、标记状态和删除。
- 任务包含背景、当前判断、结论。
- 节点详情支持 Markdown 注释，可记录图片、链接、代码块、表格等内容。
- 支持浅色和深色主题，默认浅色。
- 数据保存在本机应用数据目录中的 `task-data.json`，不依赖云端服务。
- 首次启动不预置任务数据，从空列表开始记录。

## 下载和安装

正式可下载版本通过 GitHub Releases 分发。进入仓库的 Releases 页面，下载对应系统的安装包：

- macOS: 下载 `.dmg` 或 `.zip`。
- Windows: 下载 `.exe` 安装包。

当前没有做应用商店分发，也没有接入远程服务。macOS 未签名版本首次打开时可能会出现系统安全提示，可在 Finder 中右键应用并选择打开。若后续需要双击无提示打开，需要配置 Apple Developer ID 签名和 notarization，但不需要上架 App Store。

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

创建正式下载版本：

```bash
git tag v0.1.0
git push origin v0.1.0
```

标签推送后，`Release Desktop Apps` workflow 会自动构建 macOS 和 Windows 安装包，并上传到 GitHub Release。Windows 安装包允许选择安装目录；如果选择一个父目录，安装器会在该目录下创建 `task track` 应用目录。

## 数据说明

桌面应用通过 Electron 主进程读写本机 JSON 文件。典型路径如下：

- macOS: `~/Library/Application Support/Personal Task Track/task-data.json`
- Windows: `%APPDATA%/Personal Task Track/task-data.json`

数据只保存在本机，不会上传到远程服务。浏览器预览模式下会回退使用 `localStorage`，仅用于开发预览。
