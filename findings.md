# Findings & Decisions

## Requirements
- User wants to use planning-with-files for the redesign process.
- Create a static page first for review.
- Do not actually modify the frontend until the user approves the direction.
- Desired tone: efficiency tool, with some visual atmosphere around "today focus".
- Latest request explicitly invokes Product Design plugin and asks to redesign this project's frontend, then first show a static interface.
- User feedback on Product Design mockup: too fancy; remove recommendation/rhythm content; prefer a simple, direct, but still beautiful personal task management tool.
- Latest feedback: return to the previous richer Product Design version, delete the left focus progress bar, delete the central recommendation/rhythm card, and replace the always-visible right node panel with a dynamic large Markdown overlay shown only after clicking a node.
- Current implementation request: apply the current version to the real project while minimizing impact on previous functionality, and replace the original node-detail Markdown editor with an embedded full Milkdown editor.

## Research Findings
- Existing app entry point is index.html, loading src/styles.css and src/app.js.
- Existing app state includes task groups, active task, task filters, priority filters, theme, tone, task tags, markdown editing, sidebar width, and detail height.
- Existing CSS already supports light/dark themes and many accent tones, including focus blue and productivity-oriented color tokens.
- Production app is plain index.html + src/app.js + src/styles.css without an existing frontend bundler.
- Milkdown/Crepe can be bundled into a browser script with esbuild and loaded before src/app.js.
- Existing mockup exists at mockups/today-focus.html and emphasizes a sidebar with today's focus items plus a wider task workspace.
- Current render structure includes sidebar stats, search, task list, today-focus section, group tabs, task page, task brief fields, flow list, selected node detail, markdown toolbar, and context menus.
- Existing design patterns are compact and operational; the redesign should improve hierarchy and atmosphere without turning the UI into a landing page.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Create mockups/efficiency-focus-redesign.html | The task asks for a static page first, and mockups/ already contains static HTML. |
| Use plain HTML/CSS with minimal inline JS if needed | Keeps the review artifact easy to open and separate from app logic. |
| Use restrained, multi-hue palette | Avoids a one-note blue/slate or beige design while keeping a focused work feel. |
| Three-pane workbench | Preserves existing sidebar plus task-flow/detail mental model while making daily focus more visible. |
| Atmospheric focus band instead of hero | Adds mood while keeping first screen usable and dense. |
| New artifact path: mockups/product-design-static-redesign.html | Separates the Product Design iteration from the earlier draft. |
| New simpler artifact path: mockups/simple-task-manager-redesign.html | Keeps a clean iteration that responds directly to the user's latest feedback. |
| Two-pane layout for the simpler iteration | Reduces visual and cognitive complexity while preserving task list plus task details. |
| No recommendation/rhythm content | Latest user feedback explicitly rejected that kind of content. |
| Revised richer artifact path: mockups/product-design-revised-redesign.html | Keeps the preferred previous visual language while applying the user's three concrete changes. |
| Node detail as overlay | Avoids a cramped permanent right panel and gives Markdown editing/preview a larger workspace. |
| Use @milkdown/crepe for node notes | Crepe provides a complete Milkdown editing surface with toolbar behavior while keeping the integration compact. |
| Generate src/vendor/milkdown-editor.js and .css | Keeps the existing static script app structure and avoids a broad architecture change. |
| Update npm run check to rebuild Milkdown first | Ensures the generated editor bundle stays in sync with the entry file during validation. |
| Leave old Markdown helpers in place where they are still referenced | Reduces regression risk for export, fallback editing, image preview, and future compatibility. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| No existing planning files | Created task_plan.md, findings.md, and progress.md in the project root. |
| Browser policy blocked file:// local mockup URL | Used a local 127.0.0.1 static HTTP preview for verification. |
| Milkdown loading placeholder remained inside the host after mount | Cleared the host before creating the Crepe instance and rebuilt the bundle. |

## Resources
- /Users/xuetangyuan/Documents/个人任务管理/index.html
- /Users/xuetangyuan/Documents/个人任务管理/src/app.js
- /Users/xuetangyuan/Documents/个人任务管理/src/styles.css
- /Users/xuetangyuan/Documents/个人任务管理/mockups/today-focus.html
- /Users/xuetangyuan/Documents/个人任务管理/mockups/product-design-static-redesign.html
- /Users/xuetangyuan/Documents/个人任务管理/mockups/simple-task-manager-redesign.html
- /Users/xuetangyuan/Documents/个人任务管理/mockups/product-design-revised-redesign.html
- /Users/xuetangyuan/Documents/个人任务管理/src/milkdown-editor.entry.js
- /Users/xuetangyuan/Documents/个人任务管理/scripts/build-milkdown.cjs
- /Users/xuetangyuan/Documents/个人任务管理/src/vendor/milkdown-editor.js
- /Users/xuetangyuan/Documents/个人任务管理/src/vendor/milkdown-editor.css
- http://127.0.0.1:4173/product-design-static-redesign.html
- http://127.0.0.1:4173/simple-task-manager-redesign.html
- http://127.0.0.1:4173/product-design-revised-redesign.html

## Visual/Browser Findings
- Static redesign should preserve the product signal: task groups, today's focus, active task details, progress/flow rows, and notes/markdown workspace.
- Desktop verification at 1280x720 showed left rail, main work area, and context panel all present, with no body-level horizontal or vertical overflow.
- Mobile verification at 390x844 showed single-column app display, context panel hidden, today's focus and task flow still visible, and no horizontal overflow.
- Simple redesign desktop verification at 1280x720 showed sidebar and main detail regions present, no page-level overflow, and no "推荐" or "节奏" content.
- Simple redesign mobile verification at 390x844 showed single-column layout, no horizontal overflow, steps and notes still visible, and no "推荐" or "节奏" content.
- Revised Product Design verification at 1280x720 showed no progress bar, no recommendation/rhythm copy, node detail hidden by default, and a click on the active node opened a Markdown overlay covering about 76% of the main workspace.
- Production browser verification at localhost showed the node-detail overlay opens on node click, Milkdown/ProseMirror mounts, the loading placeholder is removed after mount, no fallback textarea is used, and no browser warnings/errors were reported.
