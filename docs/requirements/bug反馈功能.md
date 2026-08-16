请读取并分析当前 `personal-task-track` 项目的全部代码和 README，在不破坏现有功能的前提下，为项目增加“Bug 反馈”功能。

## 一、目标

用户使用本地任务管理软件时，可以在软件中填写 Bug 信息，并主动提交。

客户端不得直接调用 GitHub API，也不得保存 GitHub Token。客户端应将反馈通过 HTTPS 发送到独立后端服务，由后端调用 GitHub REST API，在 `tangyuanx/personal-task-track` 仓库中自动创建 Issue。

整体链路：

```text
本地客户端
→ POST /api/bug-reports
→ Bug 反馈后端
→ GitHub REST API
→ 创建 GitHub Issue
```

请先分析项目当前使用的前端框架、桌面框架、编程语言、构建工具、目录结构、状态管理方式和现有网络请求封装，再按照现有项目风格实现，不要无理由引入第二套框架。

## 二、第一版功能范围

### 1. 客户端入口

在合适的位置增加“反馈问题”入口，优先考虑：

```text
设置 → 帮助与反馈 → 反馈问题
```

如果当前软件没有设置页面，请根据现有界面选择合适入口，但不要大幅修改原有导航结构。

### 2. Bug 反馈表单

表单包含：

- 问题标题，必填，3～100 字
- 问题类型，必填
- 问题描述，必填，至少 10 字
- 复现步骤，选填
- 联系方式，选填，并明确标注“仅用于问题沟通”
- 是否附带基础环境信息，默认勾选
- 隐私提示和提交确认

问题类型包括：

- 功能异常
- 软件崩溃
- 数据异常
- 界面显示
- 性能问题
- 功能建议
- 其他

### 3. 自动收集的环境信息

用户允许后，自动收集：

- 软件版本
- 操作系统名称与版本
- CPU 架构
- 当前页面或模块
- 提交时间
- 客户端随机安装标识

安装标识必须是首次运行时生成的随机 UUID，不得使用 MAC 地址、硬盘序列号、CPU 序列号或其他硬件指纹。

第一版不得自动上传：

- 用户任务数据库
- 任务标题和任务内容
- 用户笔记
- 本地文件内容
- 密码
- Cookie
- Access Token
- Authorization 请求头
- 完整用户目录路径
- 未经用户选择的日志或附件

### 4. 客户端请求

客户端调用：

```http
POST /api/bug-reports
Content-Type: application/json
```

请求结构建议为：

```json
{
  "title": "新增任务后列表没有刷新",
  "category": "功能异常",
  "description": "点击保存后提示成功，但任务列表没有显示新任务。",
  "reproductionSteps": "1. 打开今日任务\n2. 新建任务\n3. 点击保存",
  "contact": "",
  "includeEnvironment": true,
  "environment": {
    "appVersion": "1.0.0",
    "os": "Windows 11",
    "architecture": "x64",
    "currentPage": "Today",
    "installationId": "随机UUID",
    "submittedAt": "ISO 8601 时间"
  }
}
```

客户端需要实现：

- 提交中状态
- 防止重复点击
- 请求超时
- 成功提示
- 失败提示
- 网络不可用提示
- 服务端错误信息解析
- 成功后清空表单
- 不在客户端输出或记录服务端密钥

提交成功后展示：

```text
反馈提交成功
反馈编号：BR-XXXXXXXX
GitHub Issue：#XX
```

如果服务端不返回公开 Issue 地址，则只展示反馈编号。

## 三、后端服务

请在仓库中创建独立的后端目录，具体名称根据现有项目结构确定，例如：

```text
services/bug-report/
```

优先使用 TypeScript 和轻量级 HTTP 框架。如果现有仓库已经存在后端技术栈，应优先复用。

提供接口：

```http
POST /api/bug-reports
GET /health
```

### POST /api/bug-reports

服务端需要：

1. 校验请求参数。
2. 清理首尾空白字符。
3. 限制字段长度。
4. 拒绝空标题和空描述。
5. 生成不可预测的反馈编号。
6. 对输入内容做基本安全处理。
7. 调用 GitHub REST API 创建 Issue。
8. 返回反馈编号和 Issue 信息。
9. 不向客户端返回 GitHub Token或内部异常堆栈。
10. 日志中不得输出 GitHub Token、联系方式完整内容或 Authorization 请求头。

反馈编号格式可以为：

```text
BR-20260725-A83F21
```

### GitHub Issue 内容

Issue 标题：

```text
[Bug][功能异常] 新增任务后列表没有刷新
```

Issue 正文：

```markdown
## 问题描述

用户填写的问题描述。

## 复现步骤

用户填写的复现步骤。

## 环境信息

- 软件版本：
- 操作系统：
- 系统架构：
- 当前页面：
- 安装标识：
- 提交时间：
- 反馈编号：

## 联系信息

如用户未填写，显示“未提供”。

> 此 Issue 由应用内 Bug 反馈功能自动创建。
```

自动添加标签：

```text
bug
from-app
```

问题类型可映射为附加标签，但标签不存在时，不应导致 Issue 创建失败。

### GitHub 配置

以下内容只能从服务端环境变量读取：

```env
GITHUB_TOKEN=
GITHUB_OWNER=tangyuanx
GITHUB_REPO=personal-task-track
PORT=3000
ALLOWED_ORIGINS=
```

提供：

```text
.env.example
```

但不得创建包含真实 Token 的 `.env`，并确认 `.env` 已加入 `.gitignore`。

绝对禁止：

- 把 GitHub Token 写进客户端
- 把 GitHub Token硬编码进服务端源码
- 把 Token提交进 Git
- 在错误信息或日志中输出 Token

## 四、安全要求

至少实现：

- 请求体大小限制
- 标题、描述和复现步骤长度限制
- 基于 IP 的基础限流
- 服务端超时处理
- GitHub API 错误处理
- CORS 白名单配置
- 安全响应头
- 输入校验
- 联系方式脱敏日志
- 统一错误响应格式

建议限制：

```text
标题：最多 100 字
问题描述：最多 5000 字
复现步骤：最多 5000 字
联系方式：最多 200 字
请求体：最多 100KB
单个 IP：每小时最多提交 5 次
```

错误响应格式统一为：

```json
{
  "success": false,
  "code": "INVALID_REQUEST",
  "message": "请完善问题标题和描述"
}
```

成功响应格式：

```json
{
  "success": true,
  "reportId": "BR-20260725-A83F21",
  "issueNumber": 38,
  "issueUrl": "https://github.com/tangyuanx/personal-task-track/issues/38"
}
```

## 五、测试要求

增加必要测试，至少覆盖：

- 正常提交
- 标题为空
- 描述过短
- 字段超过长度限制
- GitHub API 返回 401
- GitHub API 返回 403
- GitHub API 返回 422
- GitHub API 超时
- 重复快速提交
- 客户端断网
- 客户端请求超时
- 服务端返回非 JSON 内容
- 未配置 GitHub Token
- 标签不存在但 Issue 仍能创建

调用 GitHub API 的测试必须使用 mock，不得在自动化测试中创建真实 Issue。

## 六、文档要求

更新项目文档，说明：

1. 功能架构。
2. 本地开发启动方式。
3. 环境变量配置。
4. 如何创建 GitHub Fine-grained Token。
5. Token 所需最小权限。
6. 如何部署后端。
7. 如何修改客户端 API 地址。
8. 如何验证 Issue 创建。
9. 常见错误排查。
10. 隐私和安全边界。

## 七、实施顺序

请按照以下顺序执行：

1. 阅读并总结当前项目技术栈及目录结构。
2. 给出准备修改的文件列表。
3. 实现服务端最小可运行版本。
4. 为服务端编写测试。
5. 实现客户端反馈页面。
6. 接通客户端与服务端。
7. 增加错误处理和安全限制。
8. 更新 README 和 `.env.example`。
9. 执行现有测试、构建和新增测试。
10. 修复所有由本次修改引入的问题。
11. 输出最终修改摘要和验证命令。

不要只提供示例代码或设计建议，请直接修改项目文件并完成可运行实现。

如果当前仓库技术结构与上述建议冲突，请优先遵循项目已有架构，并在最终说明中解释调整原因。

在没有真实 GitHub Token 时，使用 mock 完成开发和测试。不要要求我把 Token 写入代码。最终只需要告诉我应当把 Token 配置在哪一个服务端环境变量或部署平台 Secret 中。
