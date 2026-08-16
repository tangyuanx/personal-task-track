# Workbench Demo Override

This page override replaces the generic Bento/mobile recommendations in `MASTER.md` for the Personal Task Track desktop workbench.

## Product thesis

A local-first programmer's task workbench. Its single job is to keep the next useful action visible while preserving the reasoning trail behind the task.

## Visual tokens

| Token | Value | Role |
|---|---:|---|
| Paper | `#F7F8F5` | Main workspace and input surface |
| Mist | `#E9EDE8` | App canvas and sidebar separation |
| Ink | `#17221C` | Primary text and strongest dividers |
| Spruce | `#1E4D3B` | Today focus and active route |
| Moss | `#8FB9A2` | Secondary focus and completion |
| Amber | `#A66D27` | In-progress emphasis only |
| Error | `#A64B46` | Destructive/blocked feedback only |

## Typography

- UI and Chinese content: bundled Inter + Noto Sans CJK SC, system sans fallback.
- Sequence, timestamp, counters: SFMono-Regular / Consolas / Liberation Mono.
- Scale: 11 utility, 12 metadata, 13 body/detail, 14 task row, 20 section title, 28 task title.
- No display serif, oversized dashboard numerals, or all-monospace body copy.

## Layout

```text
┌──────── 360 task context ────────┬──────────── active task workspace ────────────┐
│ brand / search                   │ task title + state + global actions           │
│ Today operational queue         │ background / progress / conclusion             │
│ repository filters              ├─────────────────────────────────────────────────┤
│ compact task rows               │ Processing / Knowledge / History               │
│ horizontal groups               │ route ledger: step / record / state / updated  │
│ settings / theme / review       │                                                 │
└─────────────────────────────────┴─────────────────────────────────────────────────┘
```

- Desktop uses a stable 360px rail and a fluid workspace.
- Below 900px, the rail becomes an upper context region and the workspace follows; neither table nor page may cause horizontal overflow.
- Dense rows use 8–16px internal spacing and 1px dividers. Large card grids are forbidden.

## Signature: route ledger

Processing nodes sit on a quiet vertical route. Root steps have numbered checkpoints; children branch from the same route with short elbows. The active checkpoint alone uses Spruce and a small moving cursor. This encodes real sequence and hierarchy rather than decorating the page.

## Interaction

- Buttons expose labels or accessible names; visible controls are at least 32px high and compact icon buttons retain a 40–44px hit area where practical.
- Use `:focus-visible` with a 2px Spruce ring and offset.
- Hover and selection transitions: 150–200ms. No page-load animation.
- Respect `prefers-reduced-motion`.
- Node records open in a modal on desktop and a bottom sheet on narrow screens.
- Today remains independent of group filters.
- Calendar access stays in the task toolbar and opens a compact popover with a selected-day task list; it is not a permanent dashboard panel.
- Theme choice stays behind the sidebar footer theme control. Forest, Mist Blue, Graphite, and Ink Night change semantic tokens only, never layout or task-state meaning.

## Copy restraint

- Do not explain hierarchy that is already visible through indentation and branch lines.
- Remove persistent interaction instructions, shortcut badges, and repeated parent names.
- Keep labels, real task content, selected-date context, empty states, and confirmation feedback.

## Anti-patterns

- No Bento dashboard, recommendation/rhythm widgets, KPI hero cards, blue SaaS CTA palette, excessive pills, glassmorphism, decorative gradients, large shadows, emoji icons, or invented analytics.
- Do not merge task Knowledge Notes and node records.
- Do not hide hierarchy or status behind color alone.
