# 第28阶段正式应用移植记录

日期：2026-10-07。基线：远程 `main` / `83cce921cd946a9d9a7390281a56e4ed6b795239` / v0.1.213。采用当天更新的**操作组逐帧同步**指令；不采用已废弃的单按钮终点轨迹。

## 当前交付

已经接入真实 Electron 应用，使用真实任务模型、编辑器和持久化接口；没有复制 Demo 数据来替代正式功能。用户在本地候选打开后明确要求“推送到远程并发布新版本”，据此发布v0.1.214。发布仅更新版本元数据与交付文档，功能候选不变；实体鼠标及跨平台验收的剩余项继续保留。

同步前的 tracked 内容保存在 `stash@{0}`（`phase28 pre-sync preserved local tracked changes 20261007`）。远程已经包含对应编辑器优化，并增加区域复用、重复绑定和日历布局修正，因此保留远程修正版；本地 `prototypes/README.md` 已恢复，未跟踪 Demo/QA/设计文件完整保留。原本暂存的 node_modules 删除状态未改动。

## 已有能力与补齐

| 范围 | 最新正式版已有 | 本轮补齐 |
|---|---|---|
| 笔记编辑 | Milkdown 实例/DOM 缓存、序列化缓存、撤销和选择接口；源编辑；任务和节点草稿 | 沿用原生命周期；真实渲染器确认任务笔记 DOM/实例在往返页签后保留 |
| 文件与恢复 | 文件绑定、外部变更监听、冲突/覆盖确认、保存错误恢复、Recovery、删除恢复 | 全部保留；不改保存协议或数据结构 |
| 阅读位置 | 同视图滚动捕获、知识页/列表缓存 | 会话内每任务×页签容器×节点位置记忆，180项上限；新对象起点、实际边界截断；过期恢复回调检查当前视图身份 |
| 节点操作 | 无限节点、详情、收起、键盘导航 | 父节点收起锚定；关闭详情/Escape 后焦点返回同节点，preventScroll |
| 界面位移 | 既有最终布局和各阶段冻结样式 | 200ms cubic-bezier(.2,.8,.2,1)，快速反向读当前视觉位置后取消旧动画；测最终布局后暂停FLIP，原生确认后播放 |
| 系统鼠标 | 正式项目没有移动桥 | 隔离 preload 武装可信主点击；受限 start/frame/finish；逐显示帧读取真实组矩形，无独立指针轨迹 |
| 偏好 | 既有设置行样式 | 外观中连续切换/原有切换、操作组移动时跟随鼠标；设备本地偏好；系统减少动态效果关闭位移和原生跟随 |

未改动任何既有 CSS 文件、布局、字号、边框或工具栏。新增身份属性没有视觉效果。设置仅增加两行相关选项。

## 组身份及跟随条件

身份包含区域、任务ID、节点/分组ID、语义容器，以及控件ID/动作/参数。所有重绘替代必须唯一匹配，同时保留原按钮和组双身份；保留DOM也重新检查上下文。单独控件是单项操作组。没有页签专用原生白名单，也不按文字或行索引定位。

| 类别 | 稳定身份依据 | 资格/退出条件 |
|---|---|---|
| 三个页签、收起全部 | workspace任务 + tabs-bar + action/pane | 直接点击造成同组12–300DIP位移；仍是原按钮 |
| 简报入口、任务操作 | workspace任务 + 独立按钮ID/action，或task-heading-actions | 两维像素偏移；弹窗遮挡、按钮消失停止 |
| 导航折叠、导航工具 | topbar/brand、navigation/nav-bottom/nav-groups + action/groupId | 直接横向/纵向位移；当前任务上下文改变停止 |
| 节点行及详情工具 | task + flow-id/inspector node-id + flow-row/head/foot + action/nodeId | 丢失节点、重排使原偏移落到兄弟按钮、身份歧义停止 |
| 知识工具栏、格式工具 | task + group/toolbar语义与label + action/key | 编辑器原生命周期保留；输入/IME取消原生事务 |
| 设置、管理、弹层等 | 区域 + groupId/nodeId/action/key，或独立稳定控件 | 唯一组/按钮才接入；其他弹层或客户区遮挡停止 |

组内 offsetX/Y 是像素值，不按宽度缩放。不足12DIP或超过300DIP不跟随。整数物理落点限定在原按钮、组、客户区和目标显示器的交集内，避免边缘舍入落到其他控件。每次点击一个事务；后续无新点击的 render、真实鼠标偏离、再按下、滚轮、键盘/IME、失焦、窗口/屏幕/缩放变化取消。新增/导入动作不武装跟随；直接DOM补偿仅检查首次同步布局，不追逐延迟加载。

原生忙时丢弃显示帧，不排队；50ms过期、80ms断流、350–400ms事务期限。原生适配器还核对事务token、前台应用/窗口、上一实测落点；旧回调不能重启旧任务。完成后清理，不注入点击、不隐藏系统鼠标、不制造模拟光标。

## 平台适配与打包

- macOS：Objective-C/CoreGraphics 小型独立适配器，开发时由系统编译器生成缓存；打包后从 Resources/pointer 启动，运行时不依赖编译器或Python。每次warp作用域内 suppression=0，随后恢复0.25并立即reassociate。已在本机 macOS 26.6.2 编译、只读坐标测试、过期帧拒绝与真实应用加载通过。打包钩子生成了 x86_64 + arm64 通用资源；代码部署下限12.0，其他支持版本和签名安装环境尚未实体检验。
- Windows：随应用携带固定 PowerShell/.NET/User32 适配器，以每显示器DPI感知的原生线程读取物理坐标并调用SetCursorPos。不改变执行策略或系统设置、不下载运行依赖。Electron 对每帧目标按显示器进行DIP/物理转换；落点交集使用目标显示器，不采用一个全局比例。模拟混合DPI协议与资源携带检查通过；Windows 实机、安装包启动、组织策略限制和双屏手感尚未验证。
- 其他平台接口不可用时安全关闭原生跟随，保留应用功能和设置中的可用状态。

平台坐标依据：[Electron screen](https://www.electronjs.org/docs/latest/api/screen)、[Microsoft SetCursorPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setcursorpos)；Mac兼容处理参照阶段Demo及[Wine Mac驱动](https://github.com/wine-mirror/wine/blob/master/dlls/winemac.drv/cocoa_app.m)。

## 验证证据

- 阶段桌面 Demo 已启动并检阅页签行为。`node --test prototypes/desktop-phase28/protocol.test.cjs`：4/4通过。原本的用户实体鼠标证据分别在 native-verification/native-audit-final 和 group-tracking-audit；不把旧落点证据算作本次生产验收。
- 本轮协议/渲染器单元回归：16/16通过，覆盖六种页签方向、导航/节点/简报/工具/管理身份、两维组原点、不缩放偏移、过期/越界/重排/身份拒绝、接管、不排队、新事务取消、窗口/显示器/键盘、混合DPI、边缘舍入、会话位置和focus。
- `npm run check`：253项应用测试 + 11项反馈服务测试通过。沙箱最初阻止真实fs.watch事件；正常本地权限下独立复查及完整检查通过。新增脚本语法检查、git diff --check通过；界面机械检测结果[]。
- `node tests/continuity28.ui.cjs`：在真实Electron隔离种子数据上通过六方向往返、80根节点长列表、流780px/笔记440px/历史430px恢复、真实笔记DOM/实例保留、Escape语义focus、组身份唯一性和最终矩形不变。测试合成事件不会武装/移动系统鼠标；这些不是实体手感验收。
- 用户批准发布后完整构建macOS x64/arm64 DMG与ZIP、Windows x64 NSIS安装包通过；Mac适配器架构与各安装包匹配，Windows资源与源码一致。跨平台更新元数据2份、安装产物5份摘要验证通过；release目录无AppleDouble文件。构建通过不等同于Windows实机与实体鼠标验证。
- 真实复制任务的1280×820候选已打开；主界面和设置读取通过，Mac跟随开关显示可用。计算机辅助操作存在同名Electron/窗口绑定异常，因此没有用其截图或辅助点击宣称实体鼠标同步通过。

最终矩形已在同内容的正式应用往返前后比较；既有所有CSS保持原样。另外以**同一任务/节点/笔记/历史内容、同字号/字体、同浅色主题、1280×820客户区**，实际加载Phase28 Demo与正式应用作对照：workspace、task-heading、tabs-bar、tab-content、flow-scroll、knowledge-body、article-pane等两端存在的关键区域，在flow/notes/history三种状态下均无超过1px的矩形差异。测试仅排除Demo专用38px评审条，未修改任何产品控件或永久样式。这是实际最终几何对照，不是系统鼠标同步证据；未逐像素比较字形或图像栅格。证据：`prototypes/qa/phase28-production-20261007/renderer-validation.json`。

## 本地验收数据与剩余项

真实候选数据目录：`/Volumes/T7/work/personal-task-track/.local-review/phase28-20261007/userData`。
启动前正式数据已复制到同目录父级的 `backup`，5个业务/恢复/偏好文件校验相符，清单在 `backup-manifest.json`。此次副本没有外部Markdown绑定；验收不会写正式任务目录。所有自动化种子测试使用各自临时profile，结束后清理。

待用户在当前候选中实体鼠标检阅：正常同步与完成后立即自由移动、中途接管/微小移动、高刷新率、再次点击和快速反向、禁用开关/原有切换/系统减少动态效果、弹层遮挡、删除/完成/换任务、窗口改变。Windows、多屏不同DPI、其他macOS版本及签名安装环境另行验收。

分析矩阵的编辑/源码块映射、目录精确块定位、列表移除缓冲、日历/浮窗新连续性方案等仍是原分析中标为待实现的后续设计；本轮保留既有功能，未冒充阶段28 Demo已实现范围。

用户已明确批准推送与发布；发布版本为v0.1.214。发布前重新检查远程main及最高版本标签，并执行完整检查和macOS/Windows构建。
