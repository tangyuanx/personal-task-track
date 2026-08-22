# Knowledge Note Local Storage Risk Register

本登记表记录 Task 10.4 对 P1 风险的处理结果。`knowledge-note-local-storage/` 是外部输入资料目录，不属于本登记表或项目发布内容。

状态说明：`FIXED/VERIFIED` 表示已完成最小修复并有自动测试；`VERIFIED_NOT_AN_ISSUE` 表示针对当前实现边界已证明不会产生原登记项描述的 P1 影响，但仍可能保留 P2 级平台或发布验证工作。

## P1 register

| Risk ID | 模块 | 问题、代码位置、根因 | 触发条件与最坏影响 | 数据/文件影响 | 等级 | 建议 | 状态与验证 |
|---|---|---|---|---|---|---|---|
| R007 | Recovery / task data | `app/main/storage.cjs:writeTaskData`、`app/main/recovery.cjs:writeRecoveryData` 原先使用固定 `.tmp` 与 `writeFile`，缺少句柄同步。 | 并发写入、进程退出或磁盘缓存尚未落盘时发生崩溃。最坏为最新任务数据或 Recovery 不可恢复。 | 数据丢失：是；Markdown 损坏：否；静默覆盖：可能；Recovery 错误：是；附件丢失：否；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：改用同目录唯一临时文件、`wx`、写入、`sync()`、关闭后替换，失败清理临时文件。测试：`task data and Recovery writes sync temporary files before replacement`、完整 desktop 回归。 |
| R008 | task-data IPC / renderer | `app/renderer/src/app.js:flushSave` 原先只记录异常，不向用户暴露写失败。 | 权限、磁盘满或 I/O 失败。最坏为用户以为已保存而退出，任务数据未持久化。 | 数据丢失：是；Markdown 损坏：否；静默覆盖：否；Recovery 错误：可能；附件丢失：否；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：写失败返回失败结果并显示提示，保留待重试状态。测试：`renderer surfaces task-data persistence failures`。 |
| R009 | Electron lifecycle / binding | `app/main/main.cjs` 仅有 renderer 层重复绑定检查，缺少应用实例隔离。 | 用户同时启动多个实例或第二实例尝试绑定同一文件。最坏为 watcher、保存和 UI 状态互相覆盖。 | 数据丢失：可能；Markdown 损坏：可能；静默覆盖：是；Recovery 错误：可能；附件丢失：可能；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：启动前申请 `requestSingleInstanceLock()`，第二实例只聚焦已有窗口；保留 canonical path 重复绑定检查。测试：IPC/lifecycle source regression。 |
| R010 | FileWatcher lifecycle | `app/main/knowledge-watcher.cjs` 未监听 watcher `error`，生命周期异常会变成未处理事件。 | 目录卸载、网络盘断开或底层 watcher 失败。最坏为状态停止更新且用户继续编辑旧内容。 | 数据丢失：可能；Markdown 损坏：可能；静默覆盖：可能；Recovery 错误：可能；附件丢失：否；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：监听 watcher error 并发出 `file-unavailable`，不伪造 missing 状态。测试：`knowledge file watcher contains read and watcher errors as unavailable events`。 |
| R011 | network/removable paths | 远程或可移除路径的读取可能长期不返回。根因是文件系统本身可阻塞，而 watcher 原先没有边界。 | 网络盘断开、介质休眠或挂载异常。最坏为 watcher 队列长期占用、状态不刷新。 | 数据丢失：可能；Markdown 损坏：否；静默覆盖：否；Recovery 错误：可能；附件丢失：否；迁移失败：否 | P1 | Fix | FIXED/VERIFIED（当前实现边界）：watcher 读取增加 5 秒超时并报告 `ETIMEDOUT`，异步读取不阻塞 renderer 事件循环。测试：watcher timeout fault injection。原生 NAS 行为仍列为 P2 发布验证。 |
| R012 | document source model | `task.notes` 仍存在，曾被视为可能与 Markdown 竞争的第二正式来源。 | 旧数据、绑定文件和 renderer 状态不同步。最坏为保存旧正文覆盖文件。 | 数据丢失：可能；Markdown 损坏：可能；静默覆盖：是；Recovery 错误：可能；附件丢失：否；迁移失败：否 | P1 | Verify | VERIFIED_NOT_AN_ISSUE：绑定文件的正式保存入口使用当前编辑正文，启动恢复和保存前 hash 校验阻止旧内容静默覆盖；`task.notes` 仅为兼容缓存。测试：绑定保存、Recovery hash、外部变更回归。 |
| R013 | AssetManager | `app/main/knowledge-assets.cjs:readKnowledgeAssetFiles` 原先吞掉附件读取异常。 | Markdown 引用的附件被删除、权限不足或目录损坏。最坏为用户看到缺图但不知道原因，后续迁移遗漏附件。 | 数据丢失：可能；Markdown 损坏：否；静默覆盖：否；Recovery 错误：否；附件丢失：是；迁移失败：可能 | P1 | Fix | FIXED/VERIFIED：读取结果增加 `missingAssetFiles` 诊断，renderer 显示附件不可用状态，正文仍可读取。测试：`knowledge reads report missing Markdown attachments without hiding the document`。 |
| R014 | Markdown / UTF-8 | 文档读写涉及换行和 UTF-8 规范化，曾担心自定义 Markdown 语法被静默改变。 | 中文、Emoji、表格、代码、任务列表或大文档 Save/Reload。最坏为正文损坏。 | 数据丢失：可能；Markdown 损坏：可能；静默覆盖：否；Recovery 错误：否；附件丢失：可能；迁移失败：否 | P1 | Verify | VERIFIED_NOT_AN_ISSUE（支持范围内）：读写均以 UTF-8、LF 处理，Task9 rich Markdown、中文、Emoji、代码、表格、大文档 round-trip 已通过。未承诺任意非 Markdown 二进制语义。 |
| R015 | Migration / schema | `app/main/storage.cjs` 的 schema 版本原先没有拒绝未来版本。 | 新版本数据被旧应用读取或写回。最坏为未知字段被归一化后丢失。 | 数据丢失：是；Markdown 损坏：否；静默覆盖：是；Recovery 错误：否；附件丢失：可能；迁移失败：是 | P1 | Fix | FIXED/VERIFIED：读写均拒绝高于当前支持范围的版本并保留原文件；legacy migration 保持幂等。测试：`future task-data versions are rejected without normalization or overwrite`。 |
| R016 | Asset migration | `migrateKnowledgeAssets` 逐个写附件，失败时原先可能留下部分新文件。 | 多附件迁移中途磁盘满或权限变化。最坏为 Markdown 未写入但 attachments 目录混入半套资源。 | 数据丢失：可能；Markdown 损坏：否；静默覆盖：否；Recovery 错误：否；附件丢失：是；迁移失败：是 | P1 | Fix | FIXED/VERIFIED：记录本次新建文件，后续失败只回滚本次创建文件，不删除已存在共享附件。测试：`asset migration rolls back newly created attachments after a later asset failure`。 |
| R017 | task-data recovery | corrupt task-data 原先虽备份，但 renderer 只看到空回退，用户不一定知道备份存在。 | JSON 损坏后启动并继续操作。最坏为用户误以为空数据并覆盖备份前内容。 | 数据丢失：是；Markdown 损坏：否；静默覆盖：可能；Recovery 错误：否；附件丢失：可能；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：损坏文件改名备份并抛出带 `CORRUPT_TASK_DATA` 的错误，renderer 显示备份提示；不静默当作正常空数据。测试：损坏备份和 renderer 可见性测试。 |
| R018 | Electron lifecycle tests | 原先缺少真实 Electron 进程级测试。根因是测试使用注入 seam。 | 主进程退出、第二实例、窗口关闭和 renderer flush 的真实时序变化。最坏为退出时 Recovery 未写入。 | 数据丢失：可能；Markdown 损坏：否；静默覆盖：否；Recovery 错误：是；附件丢失：否；迁移失败：否 | P1 | Verify | VERIFIED_NOT_AN_ISSUE（当前代码路径）：加入 shutdown flush、IPC wiring、single-instance source/lifecycle 回归，并通过 Electron API seam 验证。真实打包进程测试仍是 P2 测试增强项。 |
| R019 | platform / ACL / NAS | macOS 环境无法直接证明 Windows ACL、NAS、可移除盘的原生行为。 | 平台权限、网络盘断开、Windows rename 语义差异。最坏为保存或恢复误判。 | 数据丢失：可能；Markdown 损坏：可能；静默覆盖：可能；Recovery 错误：可能；附件丢失：可能；迁移失败：可能 | P1 | Verify | VERIFIED_NOT_AN_ISSUE（已实现路径）：Windows replacement fallback、backup recovery、read-only/error injection 和 Windows canonical path 已自动验证；原生 Windows/NAS 实机验证不宣称完成，保留为发布前 P2。 |
| R020 | release hygiene | 输入资料目录和 dirty worktree 可能被误加入发布。 | 构建、打包或 push 前未检查 Git 状态。最坏为私有资料进入仓库或安装包。 | 数据丢失：否；Markdown 损坏：否；静默覆盖：否；Recovery 错误：否；附件丢失：否；迁移失败：否 | P1 | Verify | VERIFIED_NOT_AN_ISSUE（本轮）：输入目录仍为未跟踪且未被项目代码引用；本轮未构建发布、提交、打 tag 或 push。下一次远程发布仍必须先提示用户主动删除该目录并复核状态。 |
| R040 | DocumentSession / watcher | watcher 的 `file-unavailable` 曾被 renderer 统一映射为 `FILE_MISSING`。 | EIO、超时或挂载暂时不可用。最坏为用户被误导去重新定位，破坏正确绑定。 | 数据丢失：可能；Markdown 损坏：否；静默覆盖：可能；Recovery 错误：可能；附件丢失：否；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：仅 ENOENT/ENOTDIR 进入 FILE_MISSING；其他错误保留绑定并显示暂时不可用。测试：renderer unavailable-state regression。 |
| R041 | SaveCoordinator / Recovery | Markdown 成功后原先先清理 Recovery，再异步写 task-data。 | Markdown 已写、元数据写失败或进程退出。最坏为唯一 Recovery 被提前删除。 | 数据丢失：是；Markdown 损坏：否；静默覆盖：否；Recovery 错误：是；附件丢失：可能；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：先 `save()` 并等待 `flushSave()` 成功，再删除 Recovery；失败返回 `TASK_DATA_SAVE_FAILED` 并保留 Recovery。测试：`Markdown save keeps Recovery when task metadata persistence fails`。 |
| R044 | SaveCoordinator / TOCTOU | preflight hash 后到主进程写入之间仍可能发生外部修改。 | 另一个进程在校验后、replace 前修改文件。最坏为错误覆盖新版本。 | 数据丢失：是；Markdown 损坏：是；静默覆盖：是；Recovery 错误：可能；附件丢失：可能；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：主进程 save queue 内再次读取并比较 `expectedLastSavedHash`；不匹配返回冲突且不写入。显式 overwrite 才跳过。测试：stale writer save regression。 |
| R046 | legacy migration | 混合旧数据同时存在空 `task.notes` 和字符串 `knowledgeNote` 时，旧正文可能被丢弃。 | 旧版本升级并首次保存。最坏为迁移后正文丢失。 | 数据丢失：是；Markdown 损坏：可能；静默覆盖：可能；Recovery 错误：否；附件丢失：否；迁移失败：是 | P1 | Fix | FIXED/VERIFIED：空 notes 时保留旧字符串；非空当前正文优先；迁移保持幂等。测试：`mixed legacy knowledge fields preserve the non-empty source body`。 |
| R047 | FileWatcher read path | `inspect` 未捕获 `fileReader` rejection。 | 文件系统读取抛出异常而非返回失败对象。最坏为未处理 Promise rejection，watcher 状态不再更新。 | 数据丢失：可能；Markdown 损坏：否；静默覆盖：可能；Recovery 错误：可能；附件丢失：否；迁移失败：否 | P1 | Fix | FIXED/VERIFIED：读取异常统一转为 `file-unavailable`，并保留 watcher 生命周期。测试：watcher read exception regression。 |

## 建议处理顺序

Task 10.4 的 P1 均已完成修复或基于自动验证记录为 `VERIFIED_NOT_AN_ISSUE`。后续优先级为：

1. 发布前在 Windows 实机验证 R006/R019 的 rename、ACL、只读和中断恢复语义；
2. 在可控 NAS/可移除介质上验证 R011/R019 的超时、断开和重新挂载行为；
3. 继续保留 R020 的发布门禁：构建或远程 push 前，先提示用户删除 `knowledge-note-local-storage/`，由用户主动完成后再继续。

## Task 10.5 P2/P3 decision register

本节覆盖 Task 0～Task 10.4 记录中剩余的 P2/P3 项。每项只有一个最终结论。涉及数据丢失、Markdown 损坏、静默覆盖或 Recovery 可靠性的项目不以 `DEFERRED` 关闭。

| Risk ID | 模块 | 问题 | 等级 | 最终结果 | 依据/当前处理 |
|---|---|---|---|---|---|
| R021 | Windows replacement | macOS 环境无法执行真实 Windows 进程中断与 rename 时序。 | P2 | VERIFIED_NOT_AN_ISSUE | Windows fallback、backup restore、replace failure 已通过 fault injection；真实 Windows 实机属于发布验证边界，不改变当前代码安全结论。 |
| R022 | NAS / removable media | 无法在当前环境验证网络盘断开、重新挂载和 watcher 原生行为。 | P2 | VERIFIED_NOT_AN_ISSUE | watcher 有 `ETIMEDOUT`、error event 和 unavailable 状态；实机验证是环境覆盖项，不是当前已证明的静默覆盖问题。 |
| R023 | Electron lifecycle | 没有完整打包应用的多进程/退出时序测试。 | P2 | DEFERRED | 现有 IPC seam、shutdown flush 和 single-instance 回归已覆盖核心逻辑；缺口是测试环境真实性。 |
| R024 | Migration | 超大历史 task-data 的迁移耗时和内存曲线未实测。 | P2 | DEFERRED | 当前迁移纯函数、幂等、非破坏，不启动批量文件迁移；极大数据集性能可延期。 |
| R025 | Markdown editor | 超大 Markdown 文档的编辑器交互性能未建立明确预算。 | P3 | DEFERRED | Task9 已覆盖 large document；用户可拆分超大文档。后续做性能基准时处理。 |
| R026 | UI / native dialog | 未在打包 Electron 中完成视觉、原生 Save/Open dialog 和真实快捷键实机验收。 | P2 | DEFERRED | renderer harness、静态检查和代码路径已验证；当前 workaround 是使用桌面测试与手工验收。 |
| R027 | Markdown compatibility | 未承诺所有非 Markdown、自定义扩展或二进制内容的语义保真。 | P3 | VERIFIED_NOT_AN_ISSUE | 保存服务按 UTF-8 文本和换行规范化处理，不把不支持格式伪装成已支持；支持范围内 round-trip 已验证。 |
| R028 | Legacy migration tooling | 未提供一次性批量导出所有旧笔记的迁移工具。 | P2 | DEFERRED | 读取不改原文件，首次显式保存才迁移；workaround 是按需打开并保存。后续可在独立 migration 需求中处理。 |
| R029 | Schema downgrade | 未执行真实旧版本应用的 downgrade 测试。 | P2 | VERIFIED_NOT_AN_ISSUE | 当前应用对未来 schema 明确拒绝读写，不会静默降级覆盖；原文件保持不变。 |
| R030 | Asset cleanup | 失败历史或用户手工删除后可能遗留无引用附件/Recovery 资源。 | P3 | DEFERRED | 当前策略不自动删除共享或不确定归属的文件；workaround 是用户手工清理。后续在附件清理需求中增加引用扫描和回收站策略。 |
| R031 | Conflict UI | 未实现完整 Diff 视图，只提供 reload/overwrite/Save As。 | P2 | DEFERRED | 当前冲突默认阻止静默覆盖，用户可另存为保留两个版本；后续 UI 增强需求处理。 |
| R032 | Editor UX | 未持久化笔记光标、滚动位置和编辑会话 UI 状态。 | P3 | DEFERRED | 不影响正文、Markdown 文件或 Recovery 数据；重新打开时使用默认编辑位置。 |
| R033 | Attachment optimization | 未做跨笔记附件去重、全局垃圾回收或引用计数。 | P3 | VERIFIED_NOT_AN_ISSUE | 内容 hash 文件名避免同目录重复写入，删除绑定不删除用户文件；剩余问题是磁盘优化而非数据安全。 |
| R034 | Release hygiene | 尚未执行最终 release 构建、清洁工作区检查和远程发布门禁。 | P2 | DEFERRED | 本轮明确不发布；workaround 是发布前人工检查，且必须先提示用户主动删除 `knowledge-note-local-storage/`。后续 Task 11/12 处理。 |
| R035 | Product scope | 未加入云同步、跨设备合并或文件锁协作。 | P3 | DEFERRED | 当前产品是单机本地文件化；workaround 是单设备使用并依赖 external-change 检测。后续独立同步需求处理。 |
| R036 | User-owned files | 删除任务、移除绑定和关闭草稿不会自动清理用户文件。 | P3 | VERIFIED_NOT_AN_ISSUE | 这是安全约束而非缺陷：绑定移除只改 app metadata，避免误删共享附件和 Markdown。 |

## Final Deferred Risk List

以下是本轮最终延期项；它们当前不构成数据丢失、Markdown 损坏、静默覆盖或 Recovery 不可靠风险。

### R023 — 完整 Electron 进程级测试

- 问题：未覆盖完整打包应用的多进程、窗口退出和真实第二实例时序。
- 当前影响：测试对真实 Electron 环境的信心不足，不能发现所有平台生命周期差异。
- 数据安全：否；核心 shutdown flush、IPC 和单实例逻辑已有 seam 回归。
- 可以延期的原因：缺口是测试环境真实性，不是已观察到的数据破坏行为。
- 当前 workaround：运行 desktop harness、IPC 静态回归和完整 `npm run check`。
- 后续建议：Task 11 发布验证或下一个版本增加打包应用 smoke/lifecycle 测试。

### R024 — 超大历史数据迁移性能

- 问题：未对极大历史 task-data 做迁移耗时和内存基准。
- 当前影响：极端数据集启动可能变慢或占用较多内存。
- 数据安全：否；迁移是纯函数、幂等且读取不重写原文件。
- 可以延期的原因：当前验收范围已覆盖正常和大文档场景，极端数据不阻塞本地文件化发布。
- 当前 workaround：按需打开/保存，避免一次性批量迁移。
- 后续建议：独立 migration/performance 版本，增加基准数据集和上限。

### R025 — 超大 Markdown 编辑性能

- 问题：未建立超大 Markdown 编辑器的交互延迟预算。
- 当前影响：极大文档可能出现编辑或渲染卡顿。
- 数据安全：否；文件保存和 Recovery 仍有独立保护。
- 可以延期的原因：Task9 已验证 large document，剩余是体验优化。
- 当前 workaround：拆分过大的知识笔记。
- 后续建议：下一版性能专项，增加编辑、渲染、Recovery debounce 基准。

### R026 — 打包 Electron UI/原生对话框验收

- 问题：尚未在打包应用中完成视觉、原生 Save/Open dialog 和真实快捷键验收。
- 当前影响：可能存在平台呈现或交互细节差异。
- 数据安全：否；主进程保存、取消和冲突保护已有自动测试。
- 可以延期的原因：不影响数据模型和安全写入语义。
- 当前 workaround：使用 renderer harness、静态检查和后续人工验收。
- 后续建议：Task 11 release candidate smoke test。

### R028 — 旧笔记批量迁移工具

- 问题：没有一次性将所有旧笔记批量导出为 Markdown 的工具。
- 当前影响：旧笔记需要用户逐篇首次保存，迁移过程较慢。
- 数据安全：否；读取不改原文件，首次显式保存才迁移。
- 可以延期的原因：当前设计是懒迁移，避免启动时批量写文件和不可逆变更。
- 当前 workaround：打开旧笔记后使用保存/另存为。
- 后续建议：独立 migration 需求或下一大版本提供预览、进度和回滚。

### R030 — 附件/Recovery 垃圾清理

- 问题：不确定归属或历史失败留下的资源不会自动删除。
- 当前影响：可能增加磁盘占用。
- 数据安全：否；保守不删除避免误删共享附件或 Recovery。
- 可以延期的原因：清理错误的最坏结果高于磁盘占用问题，且当前没有数据损坏证据。
- 当前 workaround：用户手工清理确认无引用的目录。
- 后续建议：附件管理需求中实现引用扫描、预览和回收站删除。

### R031 — 完整 Diff 冲突界面

- 问题：当前只有重新加载、明确覆盖和另存为，没有逐段 Diff。
- 当前影响：用户处理冲突时比较不便。
- 数据安全：否；默认阻止静默覆盖，另存为可保留版本。
- 可以延期的原因：这是 UX 增强，不是可靠性缺陷。
- 当前 workaround：另存为两个文件后使用外部 diff 工具比较。
- 后续建议：独立 conflict-resolution UI 需求。

### R032 — 光标/滚动位置持久化

- 问题：编辑会话的光标和滚动位置不持久化。
- 当前影响：重新打开笔记需要重新定位编辑位置。
- 数据安全：否。
- 可以延期的原因：不影响 Markdown、任务数据或 Recovery。
- 当前 workaround：重新打开后手动定位。
- 后续建议：编辑器体验版本增加会话 UI 状态存储。

### R034 — 最终发布门禁

- 问题：本轮未执行 release build、提交、tag 或 push。
- 当前影响：功能尚未进入远程发布流程。
- 数据安全：否；本轮不发布反而避免输入资料目录被误提交。
- 可以延期的原因：用户明确要求先主动删除 `knowledge-note-local-storage/`，再按流程推送。
- 当前 workaround：保持当前 dirty worktree，不执行 release/push；发布前先提醒用户删除输入目录并复核状态。
- 后续建议：Task 11/12，完成构建、版本、提交、tag、删除确认和 push。

### R035 — 云同步/跨设备协作

- 问题：未实现云同步、跨设备合并和协作锁。
- 当前影响：知识笔记是单机本地文件，跨设备需要用户自行管理文件。
- 数据安全：否；不引入未验证的同步覆盖逻辑。
- 可以延期的原因：超出本地文件化需求范围。
- 当前 workaround：单设备使用，依赖 external-change 检测。
- 后续建议：独立同步/协作需求，不能作为本地文件化的隐式扩展。

## Task 10.5 conclusion

- FIXED：本轮没有新增代码修复项；Task 10.4 已完成的 P1 修复继续有效。
- VERIFIED_NOT_AN_ISSUE：R021、R022、R027、R029、R033、R036。
- DEFERRED：R023、R024、R025、R026、R028、R030、R031、R032、R034、R035。
- 本轮未修改应用代码、未开始需求 #19、未构建发布、未提交、未打 tag、未 push。

## Task 11.1 Fault Injection / Destructive Testing Report

本轮只做 Release Hardening 测试和必要的测试夹具补充，没有修改生产代码、没有开始需求 #19。测试重点是：异常发生后，正式 Markdown、Recovery、附件和绑定状态是否仍保持可解释且不会被静默覆盖。

说明：FI-07（移动磁盘拔出）和 FI-08（网络路径不可访问）在当前 macOS 工作区无法进行真实物理拔盘/NAS 断网，因此使用文件读取 `EIO`、watcher error 和 `ETIMEDOUT` fault seam 复现同一错误边界；这两项的原生设备行为仍是发布前环境验证项，不能描述为已完成实机验证。

| Test ID | 测试步骤 | 预期行为 | 实际行为 | 数据损坏 | 数据丢失 | 静默覆盖 | 是否需要修复 / Risk |
|---|---|---|---|---|---|---|---|
| FI-01 | 已存在 Markdown；在临时文件写入后强制 kill 保存子进程。 | 正式文件保持旧内容；临时文件不会成为正式文件。 | 正式文件保持旧内容；仅留下可清理的唯一临时文件。 | 否 | 对既有文件否 | 否 | 不需要 P0/P1 修复；临时文件清理属于已有 R030/P3。 |
| FI-02 | 已存在 Markdown；临时文件完成 `sync`、正式 replace 前强制 kill。 | replace 未发生时正式文件保持旧内容。 | 正式文件保持旧内容；临时文件仍可识别且未被误读。 | 否 | 对既有文件否 | 否 | 不需要 P0/P1 修复；同 R030/P3。 |
| FI-03 | 注入 `rename/replace` 失败。 | 返回明确错误，正式文件和 Recovery 不被错误清除。 | `knowledge file atomic failures preserve the original and clean temporary files` 通过；原文件不变、临时文件清理。 | 否 | 否 | 否 | 不需要修复。 |
| FI-04 | 注入临时文件写入 `ENOSPC`。 | 保存失败且保留旧 Markdown、dirty 和 Recovery。 | 保存返回磁盘空间错误；正式文件未被截断，renderer 失败状态可重试。 | 否 | 否 | 否 | 不需要修复。 |
| FI-05 | 注入 `EROFS`/只读路径。 | 不写入、不清 dirty，不伪造成功。 | watcher 报告 READ_ONLY；写入失败，原文件保持不变。 | 否 | 否 | 否 | 不需要修复。 |
| FI-06 | 保存期间删除目标目录。 | 返回路径不可用错误，不创建伪文件。 | 目录创建/打开返回 `ENOENT`；正式文件未被改写，绑定状态保留为不可用。 | 否 | 否 | 否 | 不需要修复。 |
| FI-07 | 模拟移动盘拔出：读取返回 `EIO`，watcher 发出 error。 | 绑定不应被误判为 FILE_MISSING，也不应覆盖旧内容。 | 读取转为 `file-unavailable`，绑定保留；没有静默重定位或写入。真实拔盘未实测。 | 否 | 否 | 否 | 当前无需 P0/P1；原生拔盘验证保留 R022/P2。 |
| FI-08 | 模拟网络路径不可访问：读取超过边界并返回 `ETIMEDOUT`。 | watcher 不应永久阻塞，状态应可恢复/重试。 | 5 秒边界后报告 unavailable/timeout，renderer 事件循环不被长期占用。真实 NAS 未实测。 | 否 | 否 | 否 | 当前无需 P0/P1；原生 NAS 验证保留 R022/P2。 |
| FI-09 | 外部编辑器修改已保存 Markdown。 | SAVED 时可重新加载；不应把外部新内容判成应用自己的写入。 | watcher 刷新 baseline 并自动加载外部内容；未发生误报覆盖。 | 否 | 否 | 否 | 不需要修复。 |
| FI-10 | 外部编辑器删除 Markdown。 | 进入 FILE_MISSING；不自动创建空文件或覆盖 Recovery。 | 只对 `ENOENT/ENOTDIR` 进入 FILE_MISSING；原绑定和 Recovery 未被清空。 | 否 | 否 | 否 | 不需要修复。 |
| FI-11 | 外部编辑器移动/重命名 Markdown，并发送连续事件。 | 旧路径显示缺失；用户显式定位后才能重新绑定。 | watcher 只报告旧路径缺失；relocate 流程显式选择新文件，未自动覆盖。 | 否 | 否 | 否 | 不需要修复。 |
| FI-12 | renderer 处于 DIRTY 时由外部编辑器修改文件。 | 保留本地正文和 Recovery，进入 EXTERNAL_CHANGED，阻止普通保存。 | dirty 内容未被外部内容替换；冲突动作要求 reload/overwrite/Save As。 | 否 | 否 | 否 | 不需要修复。 |
| FI-13 | 同一路径快速连续触发多次 Ctrl+S。 | 保存串行化，不能交叉写入；最终成功内容可预测。 | 同路径队列保证一次只有一个写入；队列测试显示最终内容完整，未出现交错正文。 | 否 | 否 | 否 | 不需要修复。 |
| FI-14 | Save As 选择新路径后注入目标打开 `ENOSPC`。 | 源文件保持不变；目标不存在或保持完整旧文件；dirty/Recovery 不应错误清理。 | `Save As failure preserves the source file and does not create a partial destination` 通过；源文件不变，目标未创建。 | 否 | 否 | 否 | 不需要修复。 |
| FI-15 | 多附件迁移中途让第二个附件复制失败。 | Markdown 不应先写入半套资源；只回滚本次新建附件，不删除共享附件。 | 本次新建资源回滚，Markdown/Recovery 保持；已有共享附件未删除。 | 否 | 否 | 否 | 不需要修复。 |
| FI-16 | 已存在 Recovery；Recovery 临时文件 `sync` 后强制 kill。 | 旧 Recovery 必须仍可读，不能被半份 JSON 替换。 | 旧 Recovery 保持可读；只留下唯一临时文件。新记录在 kill 前尚未 replace 的事实被保留为未提交状态。 | 否 | 对既有 Recovery 否 | 否 | 不需要 P0/P1 修复；临时文件清理属 R030/P3。 |
| FI-17 | Recovery 存在，同时外部修改 Markdown。 | Recovery 不应被清理或覆盖；应进入冲突并按 base hash 判断。 | Recovery 保留，外部变更进入 EXTERNAL_CHANGED；base hash 不匹配时不恢复/不覆盖。 | 否 | 否 | 否 | 不需要修复。 |
| FI-18 | 两个 Session 尝试绑定同一路径。 | 应阻止重复绑定或阻止第二个应用实例，不允许两个保存者互相覆盖。 | canonical path 重复绑定被拒绝；Electron 单实例锁让第二实例聚焦已有窗口。 | 否 | 否 | 否 | 不需要修复。 |
| FI-19 | watcher 连续收到多个 modify 事件。 | debounce 后只处理一次有效变化，状态不抖动。 | debounce 测试验证连续事件合并为单次处理；状态保持稳定。 | 否 | 否 | 否 | 不需要修复。 |
| FI-20 | 应用自己保存并触发 watcher。 | self-write 不应被当作外部修改，不应进入冲突。 | 保存后 baseline 被刷新并抑制匹配事件；未产生 EXTERNAL_CHANGED。 | 否 | 否 | 否 | 不需要修复。 |

### Task 11.1 Risk disposition

- 本轮没有发现新的 P0 或 P1 风险，因此没有新增 Risk ID，也没有需要立即修复的生产代码问题。
- FI-01、FI-02、FI-16 观察到的残留临时文件不会成为正式文件，属于磁盘清理问题，已由 R030（P3、DEFERRED）覆盖；不涉及数据安全，不应通过自动删除策略扩大误删风险。
- FI-07、FI-08 的 fault seam 结果证明当前错误边界不会静默覆盖或误判缺失，但真实 USB/NAS 设备行为仍未验证，沿用 R022 的发布验证边界。
- 本轮新增的自动回归测试位于 `tests/desktop.test.cjs`：保存进程 kill、Recovery 进程 kill、Save As 中途失败。生产代码未修改。

### Task 11.1 verification

- targeted fault-injection run: 91 desktop tests passed, 0 failed。
- full `npm run check`: 98 project tests passed，11 bug-report service tests passed，0 failed。
- syntax checks、Milkdown build、service build 均由 `npm run check` 完成并通过。
- 未执行 release build、commit、tag、push；`knowledge-note-local-storage/` 仍保持为外部未跟踪输入目录。
