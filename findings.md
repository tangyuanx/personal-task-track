# Findings & Decisions

## Requirements
- 2026-07-12 correction: node records should be short text edited in the compact `task-track.html` modal; the full Milkdown editor belongs in task-level Knowledge Notes instead of node detail.
- 2026-07-12 request: use `task-track.html` as the primary visual/interaction target, use `Task_Track_前端项目交接说明.md` as implementation guidance, and integrate the result into the existing app while preserving useful completed work.
- User wants to use planning-with-files for the redesign process.
- Create a static page first for review.
- Do not actually modify the frontend until the user approves the direction.
- Desired tone: efficiency tool, with some visual atmosphere around "today focus".
- Latest request explicitly invokes Product Design plugin and asks to redesign this project's frontend, then first show a static interface.
- User feedback on Product Design mockup: too fancy; remove recommendation/rhythm content; prefer a simple, direct, but still beautiful personal task management tool.
- Latest feedback: return to the previous richer Product Design version, delete the left focus progress bar, delete the central recommendation/rhythm card, and replace the always-visible right node panel with a dynamic large Markdown overlay shown only after clicking a node.
- Current implementation request: apply the current version to the real project while minimizing impact on previous functionality, and replace the original node-detail Markdown editor with an embedded full Milkdown editor.
- Current feature request: task review should support custom date ranges such as 6.13-6.20, and sidebar tasks should support drag reordering with a small left-side handle.
- Current correction request: align production with the final static direction, make node detail much larger with fullscreen support, fix Milkdown toolbar/icon sizing, focus new root-node title inputs instead of opening detail, and keep missing-conclusion prompts non-blocking.
- Current visual correction request: production should also match the final static mockup in overall layout, spacing, and color atmosphere, not only in functional behavior.

## Research Findings
- The v1.3.1 target uses a 370–410px left rail at desktop, a compact two-column shell, and a 3-field neutral task context strip above a table-like workflow.
- Visual hierarchy is intentionally asymmetric: only the Today panel uses a dark green gradient and prominent shadow; the repository, groups, task metadata, flow states, and controls stay neutral and low saturation.
- The current v0.1.44 browser state is visually close in palette but its left rail is substantially narrower and its empty-state view cannot exercise the dense target layout without test content.
- The target flow uses a numbered neutral sequence rail for top-level nodes plus separate indentation/tree connectors for descendants; this is stronger and clearer than the current row/checkmark-first hierarchy.
- The existing production architecture already contains stronger capabilities than the standalone target (Electron persistence, task and group ordering, task review, PDF export, Milkdown node records, node detail fullscreen, theme/font settings), so the implementation should restyle and reshape the stable production DOM instead of replacing it with the single-file data model.
- The new handoff Markdown and HTML are untracked user artifacts and must be preserved unchanged unless the user explicitly asks to edit them.
- Product Design saved-context preflight found no saved context; the repository, handoff document, and HTML are the authoritative context for this task.
- External-drive AppleDouble files exist inside `.git/objects/pack` and cause Git index warnings; they are metadata rather than intended project content.
- Existing app entry point is index.html, loading src/styles.css and src/app.js.
- Existing app state includes task groups, active task, task filters, priority filters, theme, tone, task tags, markdown editing, sidebar width, and detail height.
- Existing CSS already supports light/dark themes and many accent tones, including focus blue and productivity-oriented color tokens.
- Production app is plain index.html + src/app.js + src/styles.css without an existing frontend bundler.
- Milkdown/Crepe can be bundled into a browser script with esbuild and loaded before src/app.js.
- Existing mockup exists at mockups/today-focus.html and emphasizes a sidebar with today's focus items plus a wider task workspace.
- Current render structure includes sidebar stats, search, task list, today-focus section, group tabs, task page, task brief fields, flow list, selected node detail, markdown toolbar, and context menus.
- Task review is currently controlled by `state.reviewPreset`, `state.reviewDateField`, `renderReviewPanel()`, `reviewRange()`, and `reviewTasks()`.
- Task sidebar sorting already uses `task.order`, so manual drag ordering can preserve the existing storage shape by reassigning order values.
- Group tab drag/drop code already exists and can guide the task drag/drop interaction pattern.
- Existing design patterns are compact and operational; the redesign should improve hierarchy and atmosphere without turning the UI into a landing page.
- Production no longer has the deleted mockup files available locally, but the persistent planning files preserve the final approved direction: richer today-focus styling, no focus progress bar, no recommendation/rhythm content, and a large dynamic Markdown overlay for node detail.
- Node detail should open from the record/note cell only. Row clicks, title edits, new root nodes, new child/sibling nodes, and today's-focus navigation should not automatically open the detail layer.
- Production structure is already close enough to the final static direction to use CSS-first visual alignment: sidebar, today focus, task header, brief fields, task flow, and dynamic node detail all exist in stable markup.

## Technical Decisions
| Reuse `node.note` for the lightweight record modal and `task.notes` for Milkdown knowledge notes | Preserves the established persisted fields while changing only which editor surface owns each kind of content. |
| Use a production DOM/CSS alignment instead of replacing the app with `task-track.html` | Preserves desktop storage and all completed capabilities while allowing the source HTML to remain the visual and interaction baseline. |
| Keep current English-only data model and existing label behavior unless the integration can add bilingual storage without migration risk | The current Electron app has a materially different persisted schema; silently replacing text fields with `{zh,en}` would be a breaking data migration. |
| Treat the HTML's visual system and core interaction principles as required, while keeping current advanced record/editor behavior | This follows the user's “HTML 为主，略微结合之前已经完成的项目” direction without regressing production features. |
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
| Add review custom range as a new preset rather than replacing week/month/year/all | Preserves the existing quick filters while adding the requested precise range selection. |
| Store review custom range in UI state only | Review filters are session controls and do not need to alter task persistence. |
| Reorder tasks by updating existing `order` fields | Uses the app's current sorting model and avoids a new persistence schema. |
| Use pointer-based task dragging in addition to native drag affordance | Browser automation and some runtimes do not reliably trigger HTML5 drop; pointer dragging is more predictable for a compact sidebar list. |
| Store node detail fullscreen state only in runtime UI state | Fullscreen is a transient editing mode and should reset when switching tasks/groups or closing/saving detail. |
| Disable Crepe TopBar and constrain Milkdown icons through production CSS | The previous toolbar appeared too large and disorderly; a scoped CSS pass keeps Milkdown controls compact without affecting other app buttons. |
| Keep missing-conclusion prompt attached to the task but avoid forced navigation | The user should see the prompt on the active task while still being able to operate other nodes. |
| Use CSS-first visual alignment for Phase 10 | It lets the production UI inherit the final mockup's spacing, paper surface, focus atmosphere, and large overlay behavior without touching storage or task logic. |
| Make the default focus tone moss/green instead of blue | The final static direction emphasized calm daily focus and warm work surfaces; the previous blue tone felt less aligned. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| No existing planning files | Created task_plan.md, findings.md, and progress.md in the project root. |
| Browser policy blocked file:// local mockup URL | Used a local 127.0.0.1 static HTTP preview for verification. |
| Milkdown loading placeholder remained inside the host after mount | Cleared the host before creating the Crepe instance and rebuilt the bundle. |
| Browser CUA drag did not trigger native HTML5 drop for task rows | Added pointer-based drag handling on the small task handle and verified reordering through local browser automation. |
| Milkdown toolbar SVGs still measured up to 32px after the first styling pass | Added overrides for `.milkdown-icon svg` and toolbar item sizing; browser verification then measured max SVG size at 16px. |
| Mobile node-detail overlay measured only 188px tall after the visual layout pass | Changed the mobile detail overlay to fixed near-fullscreen; re-verification measured 359x828 at a 390x844 viewport. |

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
- 2026-07-12 final desktop verification at 1280×720 showed a 370px target-aligned rail, no document or flow horizontal overflow, matching task tabs, a neutral three-field context strip, and an expanded two-level workflow.
- Final mobile verification at 390×844 showed `document.scrollWidth` equal to the visible document width, stacked sidebar/workspace layout, three task panes, and no console warnings/errors.
- Knowledge notes persisted after a page reload; history derived the updated node trail; Milkdown mounted with one `.ProseMirror`, no fallback textarea, and no loading residue.
- The corrected interaction separates content scope cleanly: `node.note` is a short record edited in the HTML-style modal, while `task.notes` is the long-form Milkdown knowledge document.
- Record-modal browser verification confirmed Ctrl/Cmd+Enter saves, Cancel/Esc discard the draft, the flow shows only a summary afterward, and the mobile breakpoint uses a bottom drawer without horizontal overflow.
- Parent/child creation, individual collapse controls, and collapse/expand all were browser-verified; the child row disappeared on collapse and returned on expand.
- Static redesign should preserve the product signal: task groups, today's focus, active task details, progress/flow rows, and notes/markdown workspace.
- Desktop verification at 1280x720 showed left rail, main work area, and context panel all present, with no body-level horizontal or vertical overflow.
- Mobile verification at 390x844 showed single-column app display, context panel hidden, today's focus and task flow still visible, and no horizontal overflow.
- Simple redesign desktop verification at 1280x720 showed sidebar and main detail regions present, no page-level overflow, and no "推荐" or "节奏" content.
- Simple redesign mobile verification at 390x844 showed single-column layout, no horizontal overflow, steps and notes still visible, and no "推荐" or "节奏" content.
- Revised Product Design verification at 1280x720 showed no progress bar, no recommendation/rhythm copy, node detail hidden by default, and a click on the active node opened a Markdown overlay covering about 76% of the main workspace.
- Production browser verification at localhost showed the node-detail overlay opens on node click, Milkdown/ProseMirror mounts, the loading placeholder is removed after mount, no fallback textarea is used, and no browser warnings/errors were reported.
- Phase 9 production browser verification at localhost showed adding a root node focuses the new `.flow-title-input`, does not open `.node-detail`, and clicking the title input still does not open detail.
- Phase 9 node-detail verification showed the overlay opens from the record/note button, covers about 90.8% of workbench width and 94.2% of workbench height, and fullscreen mode expands to more than 95% of viewport width and more than 90% of viewport height.
- Phase 9 Milkdown verification showed ProseMirror mounts, fallback textarea remains hidden, toolbar-like controls are compact, and SVG icons max at 16px after the scoped CSS fix.
- Phase 9 conclusion-prompt verification showed `.conclusion-prompt` remains visible when completing a task without a conclusion, while adding another root node still works and focuses the new title input.
- Phase 10 desktop verification at 1280x720 showed no body-level overflow, a padded two-panel shell, three side-by-side task brief cards, and a flow list inside the visible workbench.
- Phase 10 desktop node-detail verification showed the note overlay covers about 93.8% of the task-page width and 73.2% of task-page height while Milkdown/ProseMirror still mounts.
- Phase 10 mobile verification at 390x844 showed no horizontal overflow, stacked brief cards, and a fixed near-fullscreen node-detail overlay measuring 359x828.
