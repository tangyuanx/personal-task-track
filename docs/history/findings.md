# Findings & Decisions

## Phase 33 User-confirmed Seamless In-app Update (2026-08-24)
- The requirement is not unattended automatic updating. Automatic checks may report availability, but download and installation must begin only after an explicit user upgrade action.
- This work remains local. Preserve the existing uncommitted node-record focus CSS/test changes; do not bump the package version, build a release, commit, tag, or push.
- Local `main` and `origin/main` have zero divergence at the published `v0.1.124` baseline.
- The current Windows updater already uses `autoDownload = false` and `autoInstallOnAppQuit = false`, but requires separate “download” and “restart and update” actions and launches the NSIS installer non-silently.
- The intended state flow is `available -> downloading -> preparing -> installing`, where the single explicit “upgrade and restart” action authorizes the remaining steps. An automatic availability check must never set that authorization.
- `electron-updater.quitAndInstall()` closes renderer windows before the application `before-quit` event. The existing recovery-on-shutdown path therefore cannot be the safety boundary for update installation.
- Before invoking the installer, the main process must request a renderer preparation handshake. The renderer blocks further editing, flushes node drafts and task data, and persists all pending Knowledge Note Recovery records. A timeout or failed flush must abort installation without quitting.
- On supported Windows NSIS builds, `quitAndInstall(true, true)` is the stack's silent-install-and-relaunch mechanism. macOS remains intentionally disabled until signing/notarization is available, so this phase must not claim macOS seamless update support.
- The completed controller retains `autoDownload = false` and a transient `userApprovedInstall` gate. A background check or unsolicited `update-downloaded` event cannot run the installer; one explicit “升级并重启” action authorizes download, preparation, silent install, and relaunch.
- The renderer shows download progress and a blocking in-app preparation surface only when installation is imminent. It captures mounted editors, flushes node drafts, atomically writes task metadata, and strictly persists all queued Recovery records before acknowledging the main process.
- Recovery write failures are retained by note ID. The first failed preparation keeps the app open and the package retryable; a later user retry re-attempts the failed Recovery write before installation.
- Focused tests cover user authorization, unapproved events, preparation failure, Recovery retry, repeated rapid actions, and installer launch failure. The final complete check passed 111 desktop/client tests and 11 bug-report service tests.

## Phase 32 Two-feature Release (2026-08-24)
- The user explicitly authorized publishing the two accumulated local changes: Phase 30 app-switch editing focus restoration and Phase 31 processing-flow node drag reorganization.
- Local `main` and `origin/main` have zero divergence at `2443a89`; the eight modified files belong to these two completed features and their regression/planning records.
- The highest remote release tag is `v0.1.123`, so the formal patch release is `0.1.124` / `v0.1.124`.
- Release scope remains limited to the two verified features. No additional product behavior should be introduced during packaging or publication.
- The versioned full check passed 105 desktop/client tests and 11 bug-report service tests. Formal macOS ARM64 DMG/ZIP and Windows x64 NSIS builds produced eight release/update files with no AppleDouble artifacts.
- macOS remains intentionally unsigned because the established release configuration sets `identity: null`; this is an existing distribution limitation and does not affect the two feature implementations.

## Phase 31 Processing-flow Node Drag Reorganization (2026-08-23)
- The requested capability must allow all four meaningful tree operations: change depth, change parent, reorder among siblings, and move between root/subtree locations.
- This work continues on top of the verified but uncommitted Phase 30 focus-restoration changes. Those files are relevant local work and must not be reset, committed, tagged, or pushed yet.
- Before designing the drop model, audit the existing normalized node shape and render order so drag behavior reuses the current source of truth rather than introducing a parallel tree representation.
- Nodes are persisted as nested arrays. Each node already owns `parentId`, sibling-local `order`, `type`, and `children`; normalization reconstructs those invariants recursively, and rendering sorts each collection by `order`.
- Existing mutation helpers already provide recursive lookup (`findNode`, `findNodeCollection`), flattening, and sibling reordering, so moving a whole subtree can be implemented by detaching one node object and inserting it into another existing collection.
- The processing-flow rows currently have no draggable source or drop binding. Task/group HTML5 drag handling is scoped to their own selectors and must not be reused through the generic `text/plain` channel because that risks cross-feature drops.
- Drop semantics: the upper quarter of a target row means “before” in the target's sibling collection; the middle half means “inside” as the target's last child; the lower quarter means “after”. Dropping on the flow background appends at root level.
- Moving into the source itself or any source descendant is invalid. A valid move keeps the entire source subtree intact, rewrites only the moved root's `parentId`/`type`, normalizes old and new sibling orders, expands an inside target, and updates task/node timestamps.
- Use a dedicated handle in the sequence column so title editing, record opening, context menus, and status interactions do not accidentally start a drag.
- The implementation uses a custom drag MIME and transient in-memory drag state, so task/group drag payloads cannot be mistaken for node moves. Target-row and root-background handlers are scoped to the active task.
- The mutation regression covers sibling reordering, moving into two different parents, moving a child to a root position, root append, moving a former child beside a root, automatic target expansion, and cycle rejection with an unchanged-tree assertion.
- Isolated Electron validation dispatched the same HTML5 `dragstart`/`dragover`/`drop` lifecycle used by the bound production handlers. It verified moving a root node inside another node, moving a child after a root node, moving that node before another root, and dropping a child on the flow background to append it at root level; each successful move was confirmed in the persisted `task-data.json` tree.
- The isolated invalid move attempted to drop parent `A` inside its child `C`; the DOM order and persisted tree stayed unchanged, confirming cycle rejection occurs before detachment.
- The final full check passed 105 desktop/client tests and 11 bug-report service tests. No persistence schema, version metadata, release artifact, commit, tag, or remote branch was changed.

## Phase 30 Editing Focus Restoration (2026-08-23)
- The requested workflow is local-only: implement and verify the application-switch focus restoration, but do not version, commit, tag, or push it yet.
- Scope is limited to the currently edited task title, task background, and Knowledge Notes surface; saving and navigation behavior must remain unchanged.
- Root cause for native fields: every `[data-edit-key]` blur with no in-app `relatedTarget` falls through to `render()`, rebuilding the complete page and discarding the active input plus its selection.
- Root cause for Knowledge Notes: the existing window-focus restoration calls `activeMarkdownEditor()`, which only recognizes the fallback `.markdown-editor`; the production Milkdown `.ProseMirror` surface is not captured.
- Preserve the current DOM during actual application deactivation, store a transient non-persisted editing snapshot, and restore it on window focus. In-app blur behavior should remain intact.
- For Milkdown, expose its ProseMirror selection through the existing editor wrapper so a remounted editor can restore the exact logical selection rather than only focusing the surface.
- The implemented snapshot records the field identity, selection/caret, and scroll offsets; Milkdown records ProseMirror anchor/head positions through the wrapper. Window focus restores synchronously so typing can resume during a mouse-based return before a later pointer event changes focus.
- A capture-phase pointer guard distinguishes application deactivation from deliberate in-app focus changes, preserving the existing render/commit behavior when the user intentionally clicks another control.
- The new focused regression failed before the implementation and now verifies native range/scroll restoration, late blur ordering, snapshot cleanup, and the Milkdown selection API contract.
- Full validation passed 104 desktop/client tests and 11 bug-report service tests. An isolated Electron GUI run confirmed exact insertion positions after switching to Finder and back for title (`ABCDE` -> `ABCXDE`), background (`12345` -> `123Y45`), and Milkdown Knowledge Notes (`ABC|DE` accepted resumed input at the marker).
- No persistence schema, task data, recovery data, save flow, version metadata, release artifact, commit, tag, or remote branch was changed.

## Phase 29 Today Widget Settings Dismissal (2026-08-23)
- Local `main` is clean and matches `origin/main` at the published `v0.1.122`; `knowledge-note-local-storage` remains absent.
- The widget already closes its settings menu when a pointer press occurs inside the widget but outside `#widget-menu` and `#menu-toggle`.
- Clicking the main window, desktop, or another application cannot reach that document-level pointer listener because the Today widget is a separate `BrowserWindow`.
- Window focus loss is the correct lifecycle signal for those outside clicks. Reusing `closeMenu()` preserves the existing `aria-expanded` update and resize request without changing menu controls, preferences, or visual styles.
- Keep the document-level outside-pointer behavior and add a window-level `blur` path; together they cover both clicks elsewhere inside the widget and clicks outside the widget window.
- The new assertion failed before implementation and passed after binding `window.blur` to `closeMenu()`. The final full check passed 103 desktop/client tests plus 11 bug-report service tests.
- Release version is `0.1.123`. Formal macOS ARM64 DMG/ZIP and Windows x64 NSIS builds completed with eight release/update files and no AppleDouble artifacts.
- The only build warning is the existing intentional unsigned macOS configuration (`identity: null`); it does not affect the settings-menu interaction but still causes normal macOS distribution prompts.

## Phase 28 Today Widget Theme Parity (2026-08-23)
- Local `main` is clean and matches `origin/main` at `0863cd5` / `v0.1.121`; `knowledge-note-local-storage` is absent as required before release.
- The widget does receive the main theme, Chinese font, English font, and computed base font size through `todayWidgetSnapshot()`, so the remaining mismatch is not a missing snapshot update.
- The effective main Today card is the later `today-panel.today-focus` rule: a dark green `--handoff-focus-800` to `--handoff-focus-950` surface in light mode, with a separate dark-mode gradient. The widget still follows an earlier translucent light-card treatment, so its regression test validates an obsolete selector rather than the final rendered style.
- The widget font chain places English before Chinese and only bundles the regular CJK face. The main app places Chinese first and declares both regular and bold CJK faces, which explains different Chinese metrics and bold rendering.
- Implement transparency as an isolated widget preference stored in `today-widget-preferences.json`, represented as a bounded 70–100 percentage and applied to the widget surface. This avoids changing task data or main-window appearance.
- Keep the widget menu itself within the widget surface and expose the percentage beside a native range control; default to full opacity for backward-compatible readability.
- The isolated Electron visual check rendered the widget with the same dark green light-theme surface as the main Today card, matching Chinese metrics and a stable empty state; the accessibility tree confirmed the opacity slider is present in the widget settings.
- All 8 focused Today-widget tests passed. The final full check passed 103 desktop/client tests plus 11 bug-report service tests.
- Release version is `0.1.122`. Formal macOS ARM64 DMG/ZIP and Windows x64 NSIS builds completed, producing eight release/update files without AppleDouble artifacts.
- macOS remains intentionally unsigned because `build.mac.identity` is `null`; this is an existing distribution limitation rather than a regression from the widget change.

## Phase 19 Requirements (2026-07-13)
- `frontend_modification.md` is the user-provided source of truth for this change.
- Local `main` and `origin/main` are identical at `1f36c3c`; v0.1.50 already contains the confirmed empty-group sidebar bottom-anchor fix.
- Preserve the existing task data structure and all unrelated business behavior.
- Replace the filtered-list empty state with only `没有符合筛选的任务`, positioned near the top with an approximately 18px/500 title and 13px supporting text where applicable.
- Put a moon/sun theme switch beside Settings, persist its state in localStorage-compatible preferences, and implement dark styling with CSS variables and `[data-theme="dark"]`, never `filter: invert()`.
- Preserve the user's untracked `.design-qa/`, `frontend_modification.md`, and `task-track.html` artifacts.
- The app already persisted `state.theme` through both Electron storage and browser `task-track-theme` localStorage; the direct footer switch can safely reuse that path without a new data field.
- The v0.1.45 handoff CSS introduced fixed light surface values after the original theme rules, so Phase 19 needs final-layer dark variables and component overrides for the current sidebar, workspace, editor, modal, popup, scrollbar, and SVG selectors.
- Filtered empty state and first-run empty state share `renderEmptyPage()`. The filtered case now contains only the requested title; the first-run case keeps a short 13px creation hint so an empty installation remains actionable.
- The latest remote release tag is `v0.1.50`, so this user-facing patch uses version `0.1.51` / tag `v0.1.51`.

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

## Living Handoff Findings (2026-07-12)
- The existing 1784-line handoff is a valuable specification for the original `task-track.html` v1.3.1 prototype, but its opening metadata and many “current” statements predate the Electron production app.
- A new session could currently be misled into treating the project as a single-file, dependency-free localStorage app even though production is Electron v0.1.45 with npm scripts, desktop storage normalization, packaged releases, and bundled Milkdown.
- The safest migration is to keep the prototype specification as historical design reference while adding an authoritative production-state section at the top with explicit precedence.
- The living handoff must be tracked in Git and updated as a normal completion criterion whenever release state, architecture, data fields, key interaction contracts, validation, known issues, or next work changes.
- Current production facts verified from source: package version `0.1.45`; Electron 42.5; electron-builder 26.15; local Milkdown Crepe bundle; `index.html` + `src/app.js` + `src/styles.css` renderer; Electron IPC bridge and atomic `task-data.json` persistence with browser localStorage fallback.
- Current storage normalization explicitly preserves task-level `notes`, recursive node `collapsed` state, task groups, active group, layout widths, attachments, theme/fonts, filters, and updated timestamp.
- `FEATURE_MAP.md` remains useful for concepts and call chains, but its line numbers and some editor descriptions are stale after the v0.1.45 redesign; new sessions should locate symbols with `rg` rather than trust line numbers blindly.
- The production interaction contract differs from the old prototype: task-level `task.notes` is the Milkdown knowledge document; per-node `node.note` is a compact record edited in the HTML-style modal and summarized in the flow.

## Phase 14 Screenshot Findings (2026-07-12)
- Screenshot 1 shows the real Milkdown/ProseMirror surface, but ordered and unordered lists have excessive left indentation and large paragraph/list-item gaps. A pasted image is stored as `![粘贴图片 ...](task-image:...)` plain text instead of rendering as an image.
- Screenshot 2 shows collapse-all leaves a long orphan vertical sequence rail below the last visible flow row. The bottom helper currently uses a boxed `右键` badge plus production-written copy; the user requires the exact `task-track.html` hint treatment and copy.
- Screenshot 3 shows the sidebar new-task control as a large dashed card with a separate priority row. The target HTML uses a compact, low-emphasis hint affordance instead; the red-boxed card should disappear without removing keyboard task creation.
- No saved Product Design context exists. The three user screenshots, tracked production code, and local `task-track.html` are the visual/interaction source of truth for this fix.
- Production already imports the official Crepe frame, image-block, list-item, placeholder, table, toolbar, and top-bar theme CSS. The list issue is therefore a scoped CSS override problem, not a fake editor implementation.
- Image clipboard reading succeeds: the visible `task-image:` Markdown proves the data URL was captured and stored. The failure happens because `document.execCommand("insertText")` inserts Markdown characters into ProseMirror as ordinary paragraph text instead of invoking Milkdown's `insertImageCommand`.
- `@milkdown/crepe` exposes its underlying editor, and `@milkdown/kit/preset/commonmark` exports `insertImageCommand`; the correct integration is to expose an `insertImage()` method from `MilkdownTaskEditor` and call the command through `commandsCtx`.
- The orphan sequence line comes from `.flow-table.flow-list::before` using `bottom: 39px` while the flex/grid list stretches to fill the remaining workbench. Its end must be based on visible rows rather than the container bottom.
- The HTML prototype's exact flow-footer copy is: `拖动表头分隔线可调整列宽；主轴表示顺序，缩进表示父子关系，节点状态通过删除线、字重、虚线与空心状态轴区分。` It is plain centered helper text with a dashed top border, not a boxed `右键` badge.
- The HTML prototype has no persistent new-task form card. Task creation is triggered by double-clicking repository blank space or using its right-click menu. Production can preserve keyboard creation through a compact hint row instead of the oversized dashed form.
- Browser insertion produced real Milkdown image nodes and persisted them across reload, but their blob URLs were blocked by the app CSP. Crepe renders pasted data images through `blob:` URLs, so `img-src` must explicitly allow `blob:` in addition to `data:`.
- Further inspection showed Crepe's default ImageBlock uploader returns `URL.createObjectURL(file)`. Saving that blob URL into task Markdown makes the image invalid after editor recreation/reload. Production must override ImageBlock `onUpload` to convert files to persistent data URLs; CSP `blob:` support remains useful for editor-internal previews.
- Final browser measurements: list item height about 27.15px, marker 20×24px, paragraph vertical margins about 1.12px; a real supplied PNG rendered at 966×700 before and after reload; collapsed rail endpoint equaled the last root center; 390×844 document width remained 375px within a 390px viewport; console warnings/errors were empty.

## Full Product Audit Findings (2026-07-18)

- Remote `origin/main` and `origin/HEAD` remain at `9848430` / `v0.1.72`.
- Local `main` is one release commit ahead at `0184eae` / `v0.1.73`; that commit changes `src/styles.css`, package metadata, and installs a tracked Taste Skill.
- The working tree contains unrelated workspace configuration and design artifacts: deletion of the tracked Taste Skill, a replacement untracked `frontend-design` skill, `.design-qa/`, `.planning/`, and several HTML/Markdown mockups. Preserve these changes and do not stage them as application release work.
- `package.json` currently exposes only syntax/bundle checks; the project has no focused automated regression suite for state normalization or user actions.
- Broad text search accidentally included the generated `src/vendor/milkdown-editor.js` bundle and produced excessive noise. All subsequent audits must exclude generated vendor and release output.
- The product direction remains a compact, calm, local-first task workbench. Any optional visual work should preserve density, hierarchy, keyboard focus, and reduced-motion behavior rather than introduce decorative layout changes.
- Baseline `npm run check` and `git diff --check` both pass at local v0.1.73.
- The renderer is a 3,974-line single-script application and the stylesheet is 7,396 lines; the current check command only verifies generated bundling and JavaScript syntax, so state/persistence regressions can pass unnoticed.
- Browser and Electron normalization are not equivalent: renderer normalization repairs task tags, task notes, group membership, widths, fonts, filters, and attachments, while `electron/storage.cjs` only applies shallow defaults to several of those fields. The renderer currently compensates on read, but the disk layer can retain malformed values and needs direct regression coverage.
- `FEATURE_MAP.md` is materially stale (old line counts and line references) and should be regenerated or changed to symbol-based navigation as part of the living handoff update.
- The current source contains many misplaced JSDoc blocks inside function bodies. They are harmless comments and pass syntax checks, but make maintenance and audits harder; avoid broad comment-only churn unless the affected file is already being edited.
- Confirmed export defect: `taskMarkdown()` calls nonexistent `taskGroups()` at `src/app.js:2905`; clicking “分享任务” throws before the export bridge or browser download can run. The intended source is `state.taskGroups`.
- Immediate task export can miss the newest Knowledge Notes edit because `shareTask()` serializes `task.notes` without first capturing and flushing the mounted Milkdown draft.
- Renderer normalization dereferences `task.groupId` and `node.children` without first rejecting/null-normalizing array entries. A syntactically valid data file containing `null` or malformed task/node records can make the Electron read path throw and silently fall back to browser storage.
- Several task operations assume string fields (`task.conclusion.trim()`, `task.description.trim()`, etc.). Normalization must guarantee those types rather than rely on previously well-formed files.
- Node status updates accept any string. UI menus currently emit only known values, but validating the status at the mutation boundary prevents malformed persisted state and makes future callers safe.
- Full and production-only npm audits report zero known vulnerabilities. Compatible updates were applied: `@milkdown/crepe` 7.21.2 → 7.21.3 and Electron 42.5.0 → 42.7.0; Electron 43 was intentionally not adopted because it is a major-version upgrade.
- Every literal `data-action` rendered by `src/app.js` maps to a branch in `action()`. Direct-call static analysis found no remaining undefined application function calls after correcting `taskGroups()`.
- `index.html` still used v0.1.46 query strings for renderer resources. v0.1.74 now uses a matching cache identifier so installed upgrades do not retain stale CSS/JS.
- Keyboard gaps were confirmed for Today focus and Review rows. They now expose button semantics, focus rings, and Enter/Space activation; global Escape closes context menus and modal panels.
- `FEATURE_MAP.md` line counts and fixed line references had drifted substantially. It now uses stable function/file names and documents the regression suite.
- Remote tags stop at v0.1.72, while the local base commit already has a complete v0.1.73 tag. Publish v0.1.73 as the preserved prior release and v0.1.74 as the current audit release so remote history remains contiguous.
- The first release build with `asar: false` passed but electron-builder flagged that configuration as strongly discouraged and bundled the already-precompiled Milkdown dependency tree again. Moving Milkdown to devDependencies and enabling ASAR removes the redundant runtime tree.
- ASAR creation on the external project volume produced a corrupted header offset for both platforms. Build output must be redirected to an internal APFS temp directory; the source tree can remain on the external drive.
- `scripts/build.cjs` now detects `/Volumes` workspaces, uses per-platform internal temp output, copies only release artifacts back, and removes AppleDouble files. Standard `npm run dist:mac` and `npm run dist:win` both pass with ASAR enabled.
- Final ASAR artifacts: macOS ARM64 DMG and ZIP are about 114 MB each; Windows x64 NSIS is about 98 MB. Both packaged apps contain `app.asar` with `index.html`, `src/app.js`, `electron/main.cjs`, and `package.json`.
# 2026-08-09 Bug Reporting Feature

- `bug反馈功能.md` requires a complete HTTPS client-to-backend-to-GitHub Issue flow; the desktop client must never contain or receive a GitHub token.
- The client form must validate title/category/description, optionally collect a random installation UUID and basic environment metadata, handle duplicate submission, timeout, offline, non-JSON/server errors, and clear on success.
- The new backend must expose `POST /api/bug-reports` and `GET /health`, use environment-only GitHub configuration, apply request-size limits, IP rate limiting, CORS allowlisting, security headers, input length validation, GitHub timeout/error handling, sanitized logging, and consistent JSON errors.
- Required tests include client network/error behavior and mocked GitHub outcomes, including fallback creation when an optional category label is missing.
- Existing unrelated uncommitted artifacts and `.agents/skills` changes belong to the user and must be preserved.
- Remote fetch completed on 2026-08-09; local `main` and `origin/main` are identical at `7f13e51` (`v0.1.99`).
- The application is a framework-free renderer (`index.html` + `src/app.js` + `src/styles.css`) hosted in Electron 42 with context isolation, sandboxing, a narrow preload bridge, JSON-file persistence, and a browser `localStorage` fallback.
- Build tooling is npm + esbuild + electron-builder; runtime dependencies are currently empty and Milkdown is bundled at build time from devDependencies.
- There is no existing HTTP client or network abstraction. The current CSP has `connect-src 'self'`, so a remote report service cannot be called from the renderer without either broadening CSP or routing HTTPS through a constrained Electron main-process bridge.
- Settings already render as a modal overlay from centralized state and action dispatch. A compact “帮助与反馈” section inside that panel is the lowest-risk entry point required by the specification.
- Persistent state is normalized independently in `src/app.js` and `electron/storage.cjs`; adding `installationId` requires both paths plus browser storage coverage.
- The current project tests use Node's built-in `node:test` and a VM renderer harness. The server can stay lightweight and TypeScript-first without adding a second frontend framework; tests should continue using built-in mocking/local HTTP primitives where practical.

## Phase 20 implementation decisions

- Renderer network access will remain disabled by CSP. A narrow `bugReports.submit(payload)` preload API will invoke a main-process client that accepts only the report payload, enforces timeout/error parsing, and targets `BUG_REPORT_API_URL` (localhost default only in development).
- Basic OS/version/architecture metadata will come from an IPC-backed read-only environment object. `currentPage` stays renderer-derived and never contains task titles or task content.
- `installationId` will be a UUID v4 generated once, normalized and persisted through both Electron JSON storage and the browser fallback. No hardware-derived identifier is used.
- The feedback UI reuses the existing modal vocabulary: graphite/white surfaces, the existing green focus color, compact 12–14px controls, one feedback-ID success receipt as the signature element, responsive bottom-sheet behavior, keyboard focus, and dark-mode parity.
- The independent server will use TypeScript + Fastify, manual CORS allowlisting/security headers, a small in-memory per-IP limiter, strict field/body limits, abortable GitHub requests, sanitized error responses, and no sensitive request logging.
- GitHub Issue creation will first try base and optional category labels, retry without the optional category on 422, and finally retry without labels if repository labels are unavailable. GitHub calls remain fully mocked in tests.
- GitHub's official REST documentation confirms that `POST /repos/{owner}/{repo}/issues` accepts fine-grained personal access tokens and only requires repository `Issues: write`; the token can be restricted to the single `personal-task-track` repository.

# 2026-08-12 Sidebar Resize Affordance

- The supplied 1280×820 screenshot shows the 22px `.sidebar-resizer` hover background as a full-height green-tinted strip overlapping the repository completion controls.
- The drag behavior itself is correct and should retain its broad hit target; only the visible affordance needs to become narrow.
- Current geometry is `right: -8px; width: 22px`, placing the actual sidebar boundary 14px from the resizer's left edge. A pseudo-element at `left: 14px` can render a 1px divider while the parent remains a transparent 22px pointer target.
- The visual direction is deliberately utilitarian: keep the existing palette and typography, remove the full-width hover wash, and use only a quiet boundary line that strengthens slightly on hover/active resize.
- Remote `main` and local `main` match at `7f000ed` / `v0.1.100`; unrelated `.agents`, `.design-qa`, `.planning`, `design-system`, and mockup artifacts remain user-owned and must not be staged.

# 2026-08-12 Redundant Section Label Removal

- The left repository count/search row already establishes task-list context, so “任务仓库” adds no actionable information.
- The active task title and property row already establish workspace context, so the “工作台” kicker competes with the primary title without improving orientation.
- Both labels can be removed from renderer markup without compensating CSS: the repository row is flex-based with search auto-aligned right, and the task title naturally becomes the first child of its title block.
- The first-run empty-state instruction currently names “任务仓库”; it should say “任务列表” after the visible label is removed.
- Remote fetch completed on 2026-08-12; local `main` and `origin/main` are identical at `5bdc9f1` / `v0.1.101`. Existing unrelated skill, planning, design-QA, design-system, and mockup artifacts remain user-owned.

# 2026-08-12 Calendar-integrated Task Filtering

- Tasks already carry normalized `createdAt` and `updatedAt` timestamps, and every task/node mutation advances the task's `updatedAt`; there is no planned-date or due-date field.
- Adding a due-date field would require UI, persistence, migration, and per-task editing changes that conflict with the request to avoid disrupting existing behavior.
- The lowest-impact date meaning is “last activity date,” using the latest task/node update and local calendar-day comparison.
- The date filter should be runtime-only so reopening the app cannot unexpectedly hide tasks behind a stale date. Existing status and priority preferences remain persisted and unchanged.
- The filter will compose with group scope, status, priority, and search rather than replace any existing filter.
- A compact calendar button immediately after the status group plus a native date popover preserves the current toolbar hierarchy. The button expands only when active to show `MM/DD`, and the popover includes a clear action and plain-language date meaning.
- Chromium's native Popover API and CSS anchor positioning are available in the Electron 42 runtime, avoiding custom overlay state and outside-click handling.
- Remote `main` and local `main` match at `ebf913c` / `v0.1.102`; unrelated skill, planning, design-QA, design-system, and mockup artifacts remain user-owned.

# 2026-08-12 Knowledge Image Caret Alignment

- The supplied screenshot shows a pasted knowledge-note image followed by a visible caret at the far-left line below it, while subsequently typed text is inserted immediately after the image.
- This mismatch indicates that the ProseMirror document selection is correct but the browser's inline caret geometry disagrees with the rendered image layout.
- The leading hypothesis is a block-level image override applied to an inline CommonMark image node: `display: block` moves the visual caret to a new line even though the document has no paragraph break.
- The fix must preserve persistent data-URL uploads, Milkdown commands, Markdown structure, and image sizing; only the final knowledge-editor image layout/caret geometry should change.
- Remote `main` and local `main` match at `d0d4639` / `v0.1.103`; unrelated skill, planning, design-QA, design-system, and mockup artifacts remain user-owned.
- Milkdown's CommonMark image schema explicitly declares images as `inline`, `group: inline`, and atomic. Crepe renders them through a `span.milkdown-image-inline` node view containing `img.image-inline`.
- The project override targeted every knowledge-editor `img` and forced `display: block`, overriding the inline node's intended geometry. The vendor wrapper itself remains `inline-flex` with `vertical-align: text-bottom`.
- The scoped correction keeps the wrapper inline, reserves two pixels at the editor edge for the caret, and renders only its child image as `inline-block` aligned to the bottom. Crepe's separate `.milkdown-image-block` selectors remain untouched.

# 2026-08-12 Markdown Lists, Code Semantics, and Performance

- The supplied screenshot shows both ordered and unordered first-level items beginning much farther right than normal paragraphs, a wide warm code-block wash with a high-contrast active line number, and a backtick-delimited phrase remaining as literal text.
- The desired writing surface is restrained and document-like: compact markers, quiet neutral code containers, readable monospace inline code, and immediate structural transformations without decorative animation.
- Typora's official Markdown reference treats inline code as backtick-wrapped text inside a normal paragraph, and fenced code blocks as three backticks followed by Return with optional language syntax highlighting.
- Typora's official quick-start describes live preview: inline styles render when their closing syntax is completed, while block styles render during typing or after Return. This is the interaction baseline, not a requirement to copy Typora's theme.
- Current local `main` and remote `origin/main` match at `4a42857` / `v0.1.104`; existing unrelated skill, planning, design-QA, design-system, and mockup artifacts remain user-owned.
- The final first-level list offset was cumulative: `1.35em` outer padding plus an explicit 20px label wrapper and 4px flex gap. Nested indentation can be preserved separately through `.content-dom` lists.
- Milkdown's built-in inline-code input rule recognizes only one opening and closing backtick. A project input rule using a captured backtick run and matching backreference supports both standard single delimiters and longer matching delimiters allowed by CommonMark.
- Crepe's default CodeMirror feature installs `basicSetup` (59 default key bindings plus gutters, active-line treatment, folding, search, and other extensions). The app does not configure code languages, so most of that surface is visual/runtime overhead rather than needed functionality.
- Retaining Crepe's code-block component while replacing only its `extensions` array with drawing and editing keymaps preserves code editing, navigation, undo integration, language/copy controls, and lazy viewport mounting while removing line numbers and heavy editor chrome.
- Milkdown's listener waits 200ms and then serializes the entire ProseMirror document for every `markdownUpdated` event. Because pasted images are stored as persistent data URLs inside Markdown, structural changes can trigger expensive full-document/base64 serialization during active editing.
- Switching to the non-serializing `updated` event and scheduling `getMarkdown()` after a 320ms quiet period through `requestIdleCallback` moves that work out of the structural input transaction. Blur and explicit `getMarkdown()` still flush current content synchronously, preserving save/export correctness.

# 2026-08-12 Knowledge List Marker Contrast

- The v0.1.105 list geometry is correct, but Crepe's vendor rule colors both ordered labels and unordered SVG markers with `--crepe-color-outline` (`#a8a8a8` in the light theme), which is visibly weaker than the note text.
- The application already defines theme-aware `--handoff-ink` values for both light and dark surfaces. Using that token for list markers keeps contrast consistent in both themes without introducing another palette value.
- The marker override should change only color/fill and numeric weight; the 18px marker width, 3px gap, and nested 18px indentation must remain unchanged.

# 2026-08-15 Edit Recovery, Recurring Tasks, and Flow Split Resize

- Local `main` and remote `origin/main` match at `4a2c3f2` / `v0.1.106`; unrelated skill, planning, design-QA, design-system, and mockup artifacts remain user-owned.
- Recurrence should remain a property of the existing task rather than generate copies. The Today view can evaluate whether the rule is due for the current local date/time, preserving task identity, notes, flow nodes, ordering, and completion history.
- The processing-flow divider should follow the app's established resize language: a narrow visible line, a wider transparent drag target, bounded ratios, keyboard accessibility, and no new decorative panel chrome.
- The renderer rebuilds almost the entire root on `render()`, so every post-mutation input must be rebound immediately and any focus restoration flags must be cleared deterministically.
- `bind()` delegates to `bindTaskRepositoryRows(document)`; that helper contains the active full-page binding implementation, while an older duplicate body after the return is dead code. The early return is cleanup debt but not itself the editing failure.
- The current flow model already persists independent pixel widths for title and note columns and includes column-resizer helpers, but `renderTaskPage()` renders only node rows and never inserts `renderFlowHeader()`, so users have no visible handle. The new request can reuse the existing persistence and pointer logic with a more direct split divider rather than introduce a second width model.
- Today focus currently includes only tasks with the manual `tags.today` flag. Recurring tasks need a shared predicate used by Today focus, the Today filter scope/stats, and active tag/context display where appropriate.
- Group rename blur commits state and schedules a full-root `render()` with `setTimeout(..., 0)`. When the blur was caused by clicking a task-title input, that later render destroys the newly focused input after the click completes; this directly explains the temporary inability to type after renaming.
- Repository task rows use a capture-phase click listener. It excludes checks/selects/buttons but not text inputs; when task activation or other mutation state changes, the capture handler can schedule another full render from the same click that was intended to edit a title. Text inputs must be excluded explicitly so title interaction never activates/rebuilds the task row.
- Node deletion leaves the node context-menu state populated until the subsequent render, and the next task-title click can therefore combine context dismissal, capture-phase task activation, and input focus. Clearing the context menu and all deletion-related transient focus/drag state before the single render avoids a second asynchronous rebuild.
- `action()` already clears context-menu state at entry, so the durable node-deletion fix is to prevent task-row capture activation for all editable controls and cancel any pending task drag before rebuilding; deletion itself can remain synchronous.
- The final CSS override replaces persisted title/note widths with hard-coded `1.35fr / .8fr`, so the existing width state and pointer helper cannot affect what users see. The new split should restore the two CSS variables in the final rule and update them inversely so the overall table footprint remains stable.
- Recurrence model: `{ frequency: "none" | "daily" | "weekly", weekday: 0..6, time: "HH:MM", lastCompletedOccurrence: "YYYY-MM-DD" }`. Daily and weekly rules use local wall-clock time; completion stores the current occurrence key, and a later due occurrence reactivates the same task rather than generating a copy.
- A 30-second in-app scheduler is sufficient to make a due recurrence appear while the application stays open. Startup performs the same synchronization, so sleep/relaunch and date rollover are handled without background services.
- The recurrence controls will live in the existing task property row as compact native selects/time input: “不循环 / 每天 / 每周”, weekday only for weekly rules, and time only when recurrence is enabled. This reuses the app's dense operational vocabulary and avoids a new modal.
