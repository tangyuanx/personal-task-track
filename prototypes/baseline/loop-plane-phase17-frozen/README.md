# Loop · Plane 方向 · phase 17 冻结基准

这是「唯一视觉与交互基准」的不可变副本。**不要修改这里的任何文件**；
产品与它不一致时，改产品，不改基准。

## 来源

- 原始位置：`/Volumes/T7/work/personal-task-track/prototypes/demos/`
- 入口文件：`loop-plane-phase1.html`（169936 字节）
- 冻结时间：2026-10-03
- 对应阶段：**phase 17**（shell refinement · widget 12+13 · help 14 · work 15 · task 16 · journey 17）
- 上游入口的 `<title>` 仍写着「第八阶段」，是历史遗留；以本 README 的阶段号为准。

## 与上一版基准的关系

| 基准 | 阶段 | 说明 |
| --- | --- | --- |
| `../loop-plane-phase1-frozen/` | phase 11 | 最初的冻结版本 |
| `../loop-plane-phase15-frozen/` | phase 15 | 加入 shell 润色、widget 12+13、help 14、work 15 |
| `../loop-plane-phase17-frozen/` | **phase 17** | 本版，再加入 task 16、journey 17 |

**phase 15 → 17 之间，所有已复制的层均未改变**（逐字节核对通过）：
`shell.css`（入口内联）、knowledge/fonts/settings/typography/refinement/selection/flow、
`shell-refinement`、`help`、`work`、`widget12`、`widget13`。
因此 phase 16/17 是**纯增量**：

- `loop-task-phase16.css` / `.js` —— 任务创建与属性
- `loop-journey-phase17.css` / `.js` —— 任务操作链路（完成就绪面板、创建/完成回执与撤销）

规划依据：`.planning/loop-plane-redesign/task-entry-phase16-brief.md`、
`task-journey-phase17-brief.md`。

## 使用方式

纯静态 HTML，直接以 `file://` 打开即可：

```
file:///Volumes/T7/deepseek/Loop/personal-task-track/prototypes/baseline/loop-plane-phase17-frozen/loop-plane-phase1.html
```

底部 38px 是原型评审栏，**不进入产品**（见 `stage-reports/deviations.md` 的 D-01）。

## 完整性校验

```
cd <本目录> && shasum -a 256 -c MANIFEST.sha256
```
