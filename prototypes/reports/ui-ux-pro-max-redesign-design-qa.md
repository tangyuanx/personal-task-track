# UI-UX-PRO-MAX Redesign Demo · Design QA

## Scope

- Demo: [`../demos/ui-ux-pro-max-redesign-demo.html`](../demos/ui-ux-pro-max-redesign-demo.html)
- Desktop evidence: `../design-qa/ui-ux-pro-max-demo-desktop.png`
- Product sources: `Task_Track_前端项目交接说明.md`, `FEATURE_MAP.md`, `frontend_modification.md`, `design-qa.md`, `task-flow-aligned-demo-design-qa.md`, and prior standalone demos.
- Design system: `design-system/personal-task-track-route-desk/MASTER.md` with `pages/workbench-demo.md` as the authoritative page override.
- Production `app/renderer/`, `app/main/`, storage, and package metadata were not intentionally changed by this demo task.

## Direction

The redesign is a compact “route desk” for a programmer's local-first task workflow. It preserves the existing two-region architecture, Today focus, task repository, task groups, three-field brief, Processing/Knowledge/History split, task-level Knowledge Notes, and node-level record modal.

The signature route ledger uses numbered root checkpoints for order and short branch elbows for parent/child hierarchy. The active checkpoint is distinguishable through fill, shape, weight, cursor, and text—not color alone.

## Visual QA

- Desktop 1440×900: passed. Stable 360px context rail, fluid workspace, no horizontal page overflow, all seven processing nodes visible, Today remains the only dominant color surface.
- Exact 390×844: passed through in-app viewport emulation. `window.innerWidth=390`, `clientWidth=375`, `scrollWidth=375`; sidebar and workspace fit without horizontal overflow.
- Exact 375×812 portrait: passed. `clientWidth=360`, `scrollWidth=360`.
- Exact 844×390 landscape: passed. `clientWidth=829`, `scrollWidth=829`.
- Narrow processing layout: passed. Rows reflow to node/state plus record summary while keeping the route and child hierarchy visible.
- Light/dark theme: passed. Dark modal computed background `rgb(27, 33, 29)` and foreground `rgb(238, 243, 239)`; dividers, route, focus, and status remain distinguishable.
- Modal layering: passed after refinement. Toast layer `40`, modal backdrop layer `50`, so transient feedback cannot cover modal actions.

## Interaction QA

- Search shortcut and live filtering: passed.
- All/Open/Done filters and priority filter: passed.
- Group filtering while Today stays independent: passed.
- Task selection and completion control: passed.
- Processing/Knowledge/History tabs: passed.
- Parent-node collapse/expand: passed.
- Node status update and progress summary: passed.
- Node record open, save, cancel, backdrop close, Escape, and Command/Ctrl+Enter: passed.
- Node-record focus restoration and Tab loop: passed; Tab from Save loops to Close.
- Theme switch: passed.
- Browser console: zero warnings/errors during interaction checks.

## Accessibility and delivery checklist

- Semantic headings, landmarks, labels, tab roles, state attributes, skip link, and polite status region are present.
- All structural icons are inline SVG with a consistent outline stroke; no emoji icons or raster dependencies.
- Keyboard focus uses a visible 2px focus-visible ring.
- Compact visual controls use larger interaction wrappers where needed (for example, the 16px completion square sits inside a 42×44px hit area).
- Status/priority/current state use text, shape, weight, line treatment, and position in addition to color.
- Motion is limited to 180ms state transitions and is disabled by `prefers-reduced-motion`.
- Fonts are bundled locally with `font-display: swap`; the demo has no external network dependency.
- No marketing KPI cards, recommendation/rhythm widgets, Bento layout, glassmorphism, decorative animation, or blue SaaS CTA palette were introduced.

## Code validation

- Inline JavaScript compilation (`new Function`): passed.
- Python HTML parser: passed.
- `npm run check`: passed outside the sandbox after the sandbox blocked `tsx` from creating its local IPC pipe. Result: 25 application/client tests and 11 backend tests passed.
- `git diff --check`: passed.

## Result

Final result: passed. This is a standalone design demo, not a production release.

## User-feedback refinement · 2026-08-12

- Copy reduction: removed duplicate Today framing, root-node helper sentences, history helper text, relationship prose, and record-modal coaching. Child depth is now expressed only by indentation and branch elbows.
- Workspace: removed the 1120px centered maximum. At 1280×720, the right workspace measured 920px and the inner content 909px; the remaining 11px is the scroll gutter.
- Calendar: added a secondary toolbar popover with locale-aware month navigation, selected-day state, task dots, a date agenda, and direct task switching. August 12 → 2 tasks and August 17 → 1 task passed.
- Themes: added 松林、雾蓝、岩灰、夜墨 behind the existing footer palette control. Every choice keeps a single `aria-pressed=true`; primary ink and focus contrast exceed AA, and light-theme secondary text was adjusted to at least 4.5:1.
- Search: restored the production pattern beside “任务仓库”: 142px icon-first underline field, empty visual placeholder, accessible label, and `⌘ K` shortcut.
- Browser QA: 1280×720 had zero horizontal overflow and zero console errors. Prior exact 390×844, 375×812, and 844×390 responsive passes remain applicable; the new ≤420px rules keep the calendar fixed to a 14px right inset and reduce the search to 126px.
- Project validation: `npm run check` passed outside the sandbox after the expected `tsx` IPC restriction; 25 application/client and 11 backend tests passed.
