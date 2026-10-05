# loop-plane-phase25-frozen

第25阶段（Mac / Windows 一体化标题栏）的冻结基准。三份核心资源的 SHA256 见
`MANIFEST.sha256`：

| 文件 | 作用 |
| --- | --- |
| `loop-plane-phase25-candidate.html` | 本阶段唯一入口（第24阶段入口为 `loop-plane-phase1.html`，未含本阶段标题栏） |
| `loop-window-phase25.css` | 标题栏样式层，生产端逐字节复制为 `app/renderer/src/window25.css` |
| `loop-window-phase25.js` | Demo 的浏览器预览行为（含 HTML 窗口控件模拟），生产端未复制行为，只实现其布局契约 |

加载顺序与全部外部依赖（含各阶段已冻结副本的路径）见 `DEPENDENCIES.sha256`；
Demo 入口按 `<link>` / `<script>` 出现顺序加载，`loop-window-phase25.css?v=2`
位于 `loop-management-phase24.css` 之后，`loop-window-phase25.js?v=2` 位于
`loop-management-phase24.js` 之后、`work.js` 之前。生产端的对应加载位置见
`app/renderer/index.html`（`window25.css` 在 `bridge.css` 之前）。

浏览器检阅入口（本地静态服务 127.0.0.1:4186）：

- Mac：`/loop-plane-phase25-candidate.html?phase=25&platform=mac`
- Windows：`/loop-plane-phase25-candidate.html?phase=25&platform=windows&header=aligned`

`header=aligned` 只是检阅标记；Windows 左上角排布修正（v2）已经写入资源本身。
