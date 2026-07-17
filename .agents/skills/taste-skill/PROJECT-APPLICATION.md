# Taste Skill 应用记录

## Design Read

这是一个面向单人开发者的桌面任务流工作台，不是营销页或作品集。视觉方向保持 calm utilitarian，优先级是任务扫描、状态反馈和长时间使用的舒适度。

## Dials

- `DESIGN_VARIANCE: 4`：保留现有两栏信息架构，避免高密度工作台出现装饰性错位。
- `MOTION_INTENSITY: 3`：只使用点击反馈和状态过渡，不引入滚动劫持或持续动画。
- `VISUAL_DENSITY: 7`：任务列表和处理流是产品本体，使用清晰分隔和紧凑间距，而不是营销卡片。

## Audit-first decisions

- 保留现有任务、处理流、知识笔记和历史处理的信息架构。
- 保留现有绿色品牌色、浅色/深色主题和语义状态色。
- 将英文默认字体从 Inter 调整为 Avenir Next / SF Pro Display 优先，减少通用 AI 界面痕迹，同时保留跨平台回退。
- 为任务行、处理流行、焦点任务和按钮增加轻微按压反馈，反馈只使用 transform、opacity 和颜色变化。
- 增加统一的 `prefers-reduced-motion` 降级规则，避免桌面端和辅助技术用户承受不必要的动效。

## Scope exception

Taste Skill 的 Landing Page、作品集和真实图片规则不适用于这个高密度桌面工作台，因此没有引入 Hero、图片资产、滚动叙事、营销 CTA 或装饰性卡片。它们会降低任务处理效率。

## Pre-flight result

- 主题锁定：浅色和深色分别使用同一套语义 token。
- 强调色锁定：绿色作为主要交互色，红/黄仅用于真实优先级语义。
- 动效有明确用途：按压反馈表达交互确认，颜色过渡表达选择和状态变化。
- 减少动效规则已加入 `src/styles.css`。
