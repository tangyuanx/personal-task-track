# Personal Task Track -- Codebase Feature Map

> 本文档将每个功能映射到对应的文件和函数（含行号），方便快速定位和修改。
> 所有行号以当前版本 `src/app.js` 为准。

---

## 一、项目架构概览

```
index.html                         入口 HTML
  +-- src/styles.css               全局样式（~5000 行）
  +-- src/app.js                   前端全部逻辑（~3341 行）
        +-- 数据加载 / 持久化
        +-- 状态管理（state）
        +-- 渲染（render -> DOM）
        +-- 事件绑定（bind）
        +-- Markdown 编辑器 (Milkdown)
        +-- Markdown -> HTML 渲染
        +-- 任务/节点 CRUD

electron/main.cjs                  Electron 主进程（~268 行）
  +-- IPC 通信（storage、clipboard、export）
  +-- PDF 导出
  +-- 窗口管理

electron/preload.cjs               Bridge API（18 行）
electron/storage.cjs               数据持久化（73 行）

src/milkdown-editor.entry.js       Milkdown 富文本编辑器封装
  +-- src/vendor/milkdown-editor.js  （通过 esbuild 构建）
```

### 数据流

```
用户操作 -> action(data) -> 修改 state -> render()
  -> innerHTML 重建 -> bind() 事件绑定
  -> requestAnimationFrame -> mountMilkdownEditors()
  -> save() -> desktopStorage.write() / localStorage
```

---

## 二、文件级职责

| 文件 | 行数 | 职责 |
|------|------|------|
| src/app.js | 3341 | 全部前端逻辑：状态、渲染、事件、Markdown 渲染 |
| src/styles.css | 4997 | 全部样式 |
| electron/main.cjs | 268 | 主进程：窗口、IPC handlers、PDF 导出逻辑 |
| electron/preload.cjs | 18 | contextBridge 暴露 API 给渲染进程 |
| electron/storage.cjs | 73 | 任务数据的原子写入、JSON 读取/标准化 |
| src/milkdown-editor.entry.js | 59 | Milkdown Crepe 编辑器封装类 |
| scripts/build-milkdown.cjs | 25 | esbuild 打包 milkdown-editor |
| scripts/build.cjs | 35 | electron-builder 打包入口 |
| index.html | 19 | HTML 入口 |

---

## 三、功能 -> 代码映射

### 3.1 数据模型与初始化

| 概念 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| state 对象（全部状态） | src/app.js | let state = { ... } | 104-117 |
| 任务节点数据结构 | src/app.js | makeNode() | 157-173 |
| 应用启动入口 | src/app.js | bootstrap() | 3314-3341 |
| 应用标题设置 | electron/main.cjs | app.setName | 260 |
| HTML 入口 | index.html | 加载 milkdown-editor.js -> app.js | 17-18 |

### 3.2 数据加载与持久化

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 从 Electron IPC 或 localStorage 加载全部数据 | src/app.js | loadAppData() | 350-392 |
| 从 localStorage 加载任务 | src/app.js | loadBrowserTasks() | 175-186 |
| 从 localStorage 加载分组 | src/app.js | loadBrowserTaskGroups() | 324-333 |
| 保存到 Electron IPC 或 localStorage | src/app.js | save() | 392-433 |
| 防抖写入（Electron） | src/app.js | flushSave() | 437-452 |
| 保存列宽 | src/app.js | saveFlowWidths() | 433 |
| 数据标准化（Electron） | electron/storage.cjs | normalizeTaskData() | 52-70 |
| 读取 JSON 文件 | electron/storage.cjs | readTaskData() | 14-26 |
| 原子写入 JSON 文件 | electron/storage.cjs | writeTaskData() | 28-35 |
| 损坏数据备份 | electron/storage.cjs | backupCorruptData() | 72-79 |

### 3.3 任务管理（CRUD）

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 创建任务 | src/app.js | createTask(title) | 2558-2586 |
| 在输入框中按回车创建 | src/app.js | createTaskFromBlank(title) | 2547-2554 |
| 通过 UI 按钮添加 | src/app.js | addBlankTask() | 2554-2557 |
| 删除任务 | src/app.js | deleteTask(taskId) | 2879-2893 |
| 任务完成切换 | src/app.js | toggleTaskDone(taskId) | 2893-2908 |
| 任务标签切换（Today/Later/Blocked） | src/app.js | toggleTaskTag() | 2870-2879 |
| 任务重新排序（拖拽） | src/app.js | reorderTasks() | 2639-2659 |
| 任务拖拽启动 | src/app.js | startTaskPointerDrag() | 1421-1439 |
| 任务拖拽更新 | src/app.js | updateTaskPointerDrag() | 1439-1453 |
| 任务拖拽完成 | src/app.js | finishTaskPointerDrag() | 1453-1466 |
| 共享任务（复制 Markdown） | src/app.js | shareTask() | 2415-2442 |
| 任务摘要文本 | src/app.js | taskSummary() | 1083-1093 |

### 3.4 节点管理（Flow 中的步骤/子任务）

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 添加节点（步骤/子任务） | src/app.js | addNode() | 2908-2928 |
| 添加兄弟节点 | src/app.js | addSiblingNode() | 2928-2944 |
| 删除节点 | src/app.js | deleteNode() | 2962-2974 |
| 标记节点完成 | src/app.js | toggleNodeDone() | 2944-2953 |
| 标记节点状态 | src/app.js | markNodeStatus() | 2953-2962 |
| 查找节点 | src/app.js | findNode() | 2983-2992 |
| 查找节点及其兄弟集合 | src/app.js | findNodeCollection() | 2992-3002 |
| 从数组中移除节点（递归） | src/app.js | removeNode() | 3002-3006 |
| 展平节点树 | src/app.js | flatten() | 3006-3010 |
| 节点排序 | src/app.js | sort() | 3010-3014 |
| 节点重新排序 | src/app.js | reorder() | 3014-3020 |

### 3.5 分组管理

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 选择分组 | src/app.js | selectGroup() | 2596-2611 |
| 添加分组 | src/app.js | addGroup() | 2611-2617 |
| 开始重命名 | src/app.js | startRenameGroup() | 2617-2626 |
| 提交重命名 | src/app.js | renameGroup() | 2626-2639 |
| 分组重新排序 | src/app.js | reorderGroups() | 2639-2659 |

### 3.6 渲染（DOM 生成）

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 主渲染入口（重建全部 DOM） | src/app.js | render() | 482-508 |
| 侧边栏（任务列表） | src/app.js | renderSidebar() | 509-556 |
| 今日焦点区域 | src/app.js | renderTodayFocus() | 556-576 |
| 单个焦点项 | src/app.js | renderTodayFocusItem() | 576-589 |
| 分组标签（Tab） | src/app.js | renderGroupTabs() | 589-614 |
| 单个任务项 | src/app.js | renderTaskItem() | 614-630 |
| 任务详情页面（Flow） | src/app.js | renderTaskPage() | 637-694 |
| Flow 表头行 | src/app.js | renderFlowHeader() | 770-793 |
| 单个 Flow 节点行 | src/app.js | renderFlowNode() | 742-770 |
| 节点详情面板（弹窗） | src/app.js | renderNodeDetail() | 802-877 |
| 空状态页 | src/app.js | renderEmptyPage() | 912-923 |
| 上下文菜单 | src/app.js | renderContextMenu() | 923-990 |
| 设置面板 | src/app.js | renderSettingsPanel() | 1144-1224 |
| 回顾面板 | src/app.js | renderReviewPanel() | 1224-1290 |

### 3.7 事件绑定

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 全部事件绑定入口 | src/app.js | bind() | 1466-1853 |
| 点击任务切换选中 | src/app.js | bind() 中 task-item | 1468-1480 |
| 任务拖拽处理 | src/app.js | bind() 中 drag-handle | 1482-1497 |
| 拖放排序 | src/app.js | bind() 中 drag-target | 1499-1513 |
| data-action 按钮点击 | src/app.js | bind() 中 [data-action] | 1515-1521 |
| 双击重命名分组 | src/app.js | bind() 中 sheet-tab | 1523-1530 |
| 分组编辑事件 | src/app.js | bind() 中 [data-group-title] | 1532-1548 |
| 分组拖拽排序 | src/app.js | bind() 中 sheet-tab-wrap | 1550-1566 |
| 常规编辑（input/change） | src/app.js | bind() 中 [data-edit-key] | 1568-1593 |
| 右键菜单 | src/app.js | bind() 中 [data-context] | 1595-1618 |
| 新建任务输入框 | src/app.js | bind() 中 new-task-title | 1634-1648 |
| 设置变更 | src/app.js | bind() 中 [data-setting] | 1650-1668 |
| 搜索输入 | src/app.js | bind() 中 search | 1694-1706 |
| 列宽拖拽调整 | src/app.js | bind() 中 [data-resize-col] | 1720-1725 |
| 侧边栏宽度调整 | src/app.js | bind() 中 sidebar-resizer | 1727-1731 |
| 详情面板高度调整 | src/app.js | bind() 中 detail-resizer | 1733-1737 |
| Markdown 编辑器事件（粘贴/拖放/快捷键） | src/app.js | bind() 中 markdown-editor | 1739-1787 |
| 全局点击关闭面板 | src/app.js | bind() 中 ops-app pointerdown | 1807-1846 |

### 3.8 Markdown 编辑器 (Milkdown)

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 挂载所有 Milkdown 编辑器 | src/app.js | mountMilkdownEditors() | 2100-2144 |
| 挂载降级 textarea 编辑器 | src/app.js | mountFallbackMarkdownEditor() | 2144-2162 |
| 绑定 Milkdown 事件 | src/app.js | bindMilkdownSurfaceEvents() | 2162-2184 |
| 聚焦编辑器节点 | src/app.js | focusNodeDetailEditor() | 2190-2203 |
| 插入编辑器片段 | src/app.js | insertIntoActiveEditor() | 2224-2257 |
| 创建图片嵌入片段 | src/app.js | createMarkdownImageSnippet() | 2257-2267 |
| 文本插入 | src/app.js | insertTextIntoEditor() | 2267-2283 |
| 粘贴图片插入 | src/app.js | insertMarkdownImage() | 2283-2289 |
| 选区恢复逻辑 | src/app.js | storeMarkdownSelection() / restoreMarkdownSelection() | 2008-2031 |
| 草稿自动保存 | src/app.js | updateNodeNoteDraft() / flushNodeNoteDraft() | 2051-2091 |
| 销毁 Milkdown 编辑器 | src/app.js | destroyMilkdownEditors() | 2031-2038 |
| Milkdown 类定义 | src/milkdown-editor.entry.js | MilkdownTaskEditor.create() | 13-85 |

### 3.9 Markdown 渲染（纯文本 -> HTML）

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 完整 Markdown 转 HTML | src/app.js | renderMarkdown() | 3027-3154 |
| 行内 Markdown 渲染（加粗/斜体/链接） | src/app.js | renderInlineMarkdown() | 3154-3210 |
| 表格渲染 | src/app.js | renderMarkdownTable() | 3256-3269 |
| 图片描述渲染 | src/app.js | markdownImages() | 906-912 |
| 编辑器图片预览 | src/app.js | renderEditorImagePreview() | 895-906 |
| Markdown 格式工具 | src/app.js | applyMarkdownTool() | 2671-2755 |
| 编辑器片段模板 | src/app.js | editorSnippet() | 2203-2224 |

### 3.10 剪贴板与图片

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 从剪贴板读取图片（异步） | electron/main.cjs | ipcMain.handle clipboard:read-image-data-url | 42-45 |
| 从剪贴板读取图片（同步） | electron/main.cjs | ipcMain.on clipboard:read-image-data-url-sync | 46-49 |
| 前端剪贴板 API 桥 | electron/preload.cjs | clipboard.readImageDataUrl() | 12-13 |
| 从文件选择图片 | src/app.js | pickEditorImageFile() | 2295-2323 |
| 粘贴处理（含图片） | src/app.js | handleMarkdownPaste() | 2769-2796 |
| 拖放图片处理 | src/app.js | handleMarkdownDrop() | 2796-2805 |

### 3.11 PDF / 文档导出

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 导出节点详情 PDF | src/app.js | exportNodePdf() | 2847-2870 |
| Electron PDF 导出 IPC | electron/main.cjs | exportNodeDetailPdf() | 81-114 |
| 导出任务文档 | electron/main.cjs | exportTaskDocument() | 55-80 |
| 节点详情 PDF 模板 | electron/main.cjs | nodeDetailPdfHtml() | 116-157 |
| 任务文档 PDF 模板 | electron/main.cjs | taskDocumentPdfHtml() | 159-201 |
| 导出前端 Bridge | electron/preload.cjs | export.nodeDetailPdf / taskDocument | 14-15 |
| 共享任务（Markdown） | src/app.js | shareTask() | 2415-2442 |
| 任务 Markdown 序列化 | src/app.js | taskMarkdown() | 2442-2475 |

### 3.12 设置与主题

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 设置面板渲染 | src/app.js | renderSettingsPanel() | 1144-1224 |
| 主题切换（亮/暗） | src/app.js | 设置变更处理 | 1655-1656 |
| 中英文字体切换 | src/app.js | 设置变更处理 | 1657-1658 |
| 任务/优先级过滤器 | src/app.js | 设置变更处理 | 1660-1663 |
| 设置应用函数 | src/app.js | applySetting() | 1862-1871 |
| 暗色主题 CSS | src/styles.css | [data-theme="dark"] | ~2488+ |

### 3.13 Review（回顾）面板

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 回顾面板渲染 | src/app.js | renderReviewPanel() | 1224-1290 |
| 日期范围选择 | src/app.js | renderReviewDateRangeFields() | 1265-1280 |
| 回顾项渲染 | src/app.js | renderReviewItem() | 1290-1308 |
| 任务回顾日期计算 | src/app.js | taskReviewDate() | 1315-1321 |
| 回顾范围定义 | src/app.js | reviewRange() | 1321-1339 |
| 自定义范围 | src/app.js | customReviewRange() / ensureReviewCustomDates() | 1339-1359 |
| 回顾任务列表 | src/app.js | reviewTasks() | 1308-1315 |

### 3.14 窗口与布局

| 功能 | 文件 | 函数 / 位置 | 行号 |
|------|------|-------------|------|
| 创建窗口 | electron/main.cjs | createWindow() | 11-32 |
| 列宽拖拽调整 | src/app.js | startColumnResize() | 1871-1898 |
| 侧边栏拖拽调整 | src/app.js | startSidebarResize() | 1898-1924 |
| 详情面板高度调整 | src/app.js | startDetailResize() | 1924-1955 |
| 节点详情位置 | src/app.js | nodeDetailPositionStyle() | 877-887 |
| 全屏模式 | src/app.js | action() 中 toggle-node-detail-fullscreen | 2395-2396 |

### 3.15 构建与发布

| 功能 | 文件 | 位置 | 行号 |
|------|------|------|------|
| 全部构建命令 | package.json | scripts | 13-20 |
| electron-builder 打包入口 | scripts/build.cjs | 全部 | 1-35 |
| Milkdown esbuild 打包 | scripts/build-milkdown.cjs | 全部 | 1-25 |
| macOS DMG 构建 | package.json | build.mac | 36-42 |
| Windows NSIS 构建 | package.json | build.win / build.nsis | 43-54 |
| CI 构建 | .github/workflows/build.yml | - | - |
| GitHub Release | .github/workflows/release.yml | - | - |

---

## 四、关键调用链

### 4.1 启动流程

```
index.html
  -> src/vendor/milkdown-editor.js (Milkdown 编辑器类)
  -> src/app.js:
      bootstrap() [3314]
        -> loadAppData() [350]
            -> desktopStorage.read() / localStorage 加载任务、分组、设置
        -> 填充 state
        -> render() [482]
            -> innerHTML 重建全部 DOM
            -> bind() [1466] 绑定事件
            -> mountMilkdownEditors() [2100]
```

### 4.2 用户操作流程（以"添加节点"为例）

```
用户点击"添加步骤"按钮
  -> bind() 中 [data-action] 捕获 click [1515]
    -> action({ action: "add-node", taskId, ... }) [2323]
      -> addNode(taskId, parentId) [2908]
        -> makeNode(...) 创建新节点
        -> 插入 tree
      -> render() [482]
        -> 重建 DOM
        -> bind()
        -> mountMilkdownEditors()
```

### 4.3 保存流程

```
用户操作 -> render() 开头:
  -> save() [392]
      -> Electron 环境: pendingPayload -> setTimeout -> flushSave() [437]
          -> desktopStorage.write(payload)
              -> electron/storage.cjs: writeTaskData()
                  -> 写入 temp 文件 -> 原子 rename
      -> 浏览器环境: localStorage.setItem() x 多个 key
```

---

## 五、开发注意事项

### 5.1 最重要的单一文件: src/app.js

全部前端逻辑在一个文件中，3341 行。修改时注意：
- 不要在 render() 中改变 state -- render 只读，state 在 action 中修改。
- bind() 在每次 render 后执行，所有 DOM 元素都被重建，不要引用过期的元素。
- Milkdown 编辑器在 requestAnimationFrame 中异步挂载，不要立即访问编辑器实例。
- 草稿缓存：Milkdown 内容会先缓存在 nodeNoteDrafts Map 中，render 时才会 flush 到 state。

### 5.2 数据模型

```typescript
// 任务 (Task)
interface Task {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  tags: string[];
  nodes: Node[];
  createdAt: string;
  updatedAt: string;
}

// 节点 (Node / Step / Subtask)
interface Node {
  id: string;
  taskId: string;
  parentId: string | null;
  order: number;
  type: "step" | "subtask";
  title: string;
  status: "todo" | "done" | "blocked" | "later";
  note: string;
  hypothesis: string;
  conclusion: string;
  createdAt: string;
  updatedAt: string;
  children: Node[];
}

// 分组 (TaskGroup)
interface TaskGroup {
  id: string;
  title: string;
  order: number;
}
```

### 5.3 持久化策略

Electron 环境 -> 写入 task-data.json（原子写入：先写 .tmp 后 rename）
浏览器环境 -> 分散写入多个 localStorage key

两者数据格式通过 normalizeTaskData() 统一标准化。

### 5.4 Milkdown 编辑器注意事项

- src/milkdown-editor.entry.js 用 esbuild 编译到 src/vendor/milkdown-editor.js
- 修改 .entry.js 后需运行 npm run build:milkdown 重新打包
- Milkdown Crepe 特性被精简：BlockEdit / TopBar / Toolbar 都关闭
- Milkdown 实例通过 WeakMap 跟踪，render 时销毁重建
- ES module 不支持直接在 app.js 中 import，要通过 esbuild 编译

### 5.5 命名约定

- data-action -> 按钮类操作，action(data) 统一分发
- data-edit-key -> 输入/编辑类操作，edit(data, value) 处理
- data-setting -> 设置变更，通过 change 事件触发 applySetting()
- data-context -> 右键菜单目标类型 (task / node / editor)
