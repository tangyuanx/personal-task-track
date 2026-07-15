# Design QA — task-track.html v1.3.1 alignment

- Source visual truth: `.design-qa/source-v1.3.1.png` captured from `task-track.html`.
- Implementation screenshot: `.design-qa/implementation-final-desktop.png`.
- Full-view comparison: `.design-qa/comparison-final.png`.
- Focused workflow comparison: `.design-qa/focused-comparison-final.png`.
- Mobile evidence: `.design-qa/implementation-final-mobile.png`.
- Phase 14 source evidence: `.design-qa/phase14-source-knowledge.png`, `.design-qa/phase14-source-flow.png`, `.design-qa/phase14-source-sidebar.png`.
- Phase 14 implementation evidence: `.design-qa/phase14-knowledge-final.png`, `.design-qa/phase14-flow-collapsed-final.png`, `.design-qa/phase14-mobile-flow-final.png`, `.design-qa/phase14-mobile-knowledge-final.png`.
- Phase 14 combined comparison: `.design-qa/phase14-comparison-final.png`.
- Desktop viewport/state: 1280×720, light theme, one active Today task, expanded parent/child workflow, Processing tab.
- Mobile viewport/state: 390×844, light theme, stacked sidebar/workspace layout.

## Findings

- No remaining P0/P1/P2 visual or interaction mismatches were found after the final pass.
- Fonts and typography: production now uses the target system-font direction by default, with matching compact weights, small metadata, and monospace sequence/time text. Existing user font preferences remain respected.
- Spacing and layout rhythm: the 370px desktop rail, compact repository rows, boxed horizontal groups, neutral task context strip, tabs, and table-like workflow follow the source hierarchy without desktop horizontal overflow.
- Colors and tokens: Today remains the only dark green high-emphasis surface; task repository, groups, metadata, states, and workflow surfaces remain low-saturation and neutral.
- Image quality and assets: the target has no raster imagery. The supplied search SVG is reused directly; existing production export glyphs remain crisp at UI scale.
- Copy and content: primary labels now match the target information architecture: 今日任务、任务仓库、任务分组、背景 / 目标、当前判断 / 进展、结果 / 总结、处理流、知识笔记、历史处理.
- States and interactions: Today remains independent of group selection; horizontal group scrolling works; Processing/Knowledge/History tabs work; task-level knowledge notes persist in Milkdown; node parent/child structure, individual collapse, collapse/expand all, right-click CRUD, and compact node-record modal editing work.
- Accessibility and resilience: semantic buttons/inputs remain keyboard reachable, focus styling remains visible, desktop and mobile have no page-level horizontal overflow, and browser console checks returned no warnings or errors.
- Phase 14 typography/spacing: Knowledge Notes still uses the official Milkdown/Crepe list structure, with marker boxes reduced to 20×24px, list-item height reduced to about 27px, and paragraph vertical margins reduced to about 1px. This resolves the screenshot's excessive indentation and row gaps without replacing Milkdown behavior.
- Phase 14 image fidelity: a real supplied PNG was pasted into Milkdown, rendered at its natural 966×700 dimensions, and remained valid after a full page reload. Image Markdown no longer appears as literal text.
- Phase 14 flow/sidebar fidelity: the collapsed sequence rail ends exactly at the last root-node center; helper copy/treatment matches `task-track.html`; the persistent dashed new-task card is absent and replaced by a low-emphasis hint while double-click/right-click creation remains available.
- Phase 17 empty-group/sidebar polish: at the 370px desktop rail, an empty newly created group keeps a 199px flexible task repository region while the 62px group controls and 42px footer remain bottom-aligned. The group area is transparent with zero radius and no visible scrollbar, so it reads as integrated navigation rather than a floating card.
- Phase 17 Today typography: the count now renders as a single-line `1 项待推进` label (`white-space: nowrap`) beside the 20px headline. Browser measurement confirmed a 52px-wide label with no wrapping, and the console returned no warnings or errors.

## Phase 20 — dark Today focus reference match

- Source visual truth: `.design-qa/today-reference-card.png`, cropped from the user-approved dark-mode reference.
- Implementation screenshot: `.design-qa/today-after-card.png`, captured from the actual project at `333×153` in dark mode with an empty Today list.
- Full-view and focused comparison: `.design-qa/today-after-comparison.png`; the component itself is the focused region, so a separate detail crop was not needed.
- Viewport/state: 1280×720 app viewport, dark theme, zero Today tasks, sidebar at its 370px minimum width.
- Fonts and typography: the existing project type scale, weights, line heights, letter spacing, and `07/15` date rendering already align with the approved reference and were intentionally left unchanged.
- Spacing and layout rhythm: the card remains 333px wide; the empty-state height is now exactly 153px, with the existing internal label, headline, count, and empty-copy positions preserved.
- Colors and visual tokens: only the dark Today panel receives the approved green gradient, green border, and compact shadow. Light mode and all other surfaces are unchanged.
- Image quality and asset fidelity: the reference contains no raster or icon assets; no image substitution was required.
- Copy and content: `今日聚焦`, `今日任务`, `0 项待推进`, and `今日暂无重点任务` match the reference exactly.
- Browser verification: the actual project DOM rendered the expected empty state, computed size was `333×153`, and the comparison found no actionable P0/P1/P2 mismatch.

## Phase 21 — task repository reference match

- Source visual truth: the user-supplied 408×427 dark task-repository screenshot.
- Implementation state: actual project in dark mode with six realistic tasks, the first task selected, two high-priority tasks, two medium-priority tasks, two low-priority tasks, and one Today-tagged task.
- Structure and spacing: the repository uses the reference's compact title/count header, three-part status filter, right-aligned priority filter, 58px rows, 20px circular completion state, two-line task summary, and right-aligned priority/time column.
- Colors and hierarchy: dark rows use `#1f2722`, the selected row uses `#243c30`, dividers use `#303a32`, and the selected left rail/ring use `#92c7aa`, matching the measured reference tokens.
- Requested content exception: Today/稍后/卡住 no longer render inside repository rows. Browser verification confirmed a tagged task has zero repository tag pills while its active tag is the first property directly below the task title in the right task archive.
- Interaction verification: 全部/未完成/已完成 remain working controls; selecting 高优先 reduced the list from six tasks to two and restoring 所有优先级 returned all six. Inline title editing, priority editing, completion controls, task selection, and drag affordances remain wired to the existing behavior.
- Browser verification: the final focused source/implementation comparison found no actionable P0/P1/P2 mismatch after removing inherited repository padding; the console returned no warnings or errors.

## Comparison History

1. Initial implementation comparison found a P1 workflow overflow that clipped status/time columns at 1280px, a P2 duplicate root sequence marker, and a P2 information-architecture gap from missing task tabs.
2. The workflow tracks were constrained to the available workspace, duplicate counter pseudo-elements were removed, and real Processing/Knowledge/History panes were added.
3. A focused workflow comparison confirmed separate root sequencing and child hierarchy channels. Parent/child collapse controls and collapse/expand all were added and browser-tested.
4. The corrected record flow was checked at 1280×720 and 390×844: desktop uses a centered modal, mobile uses a bottom drawer, saved records collapse back to a summary, and cancel/Esc discard unsaved changes.
5. Knowledge Notes was rechecked with a mounted Milkdown `.ProseMirror`; edits survived pane switching and page reload, with no page-level horizontal overflow or console warnings/errors.
6. Phase 14 first implementation rendered image nodes but revealed that Crepe's default blob URLs did not survive editor recreation. The uploader was changed to persistent data URLs and CSP image policy was aligned with Crepe previews.
7. Phase 14 post-fix evidence confirmed a valid 966×700 pasted image before and after reload, 27px list-item rhythm, no collapsed orphan rail, exact HTML helper copy, no oversized task-creation card, no horizontal overflow at 390×844, and no browser warnings/errors.
8. Phase 17 compared the supplied empty-group screenshot with a fresh in-app browser capture of the same empty-group state. The final layout removes the boxed group panel and visible horizontal scrollbar while preserving bottom anchoring, keyboard inputs, arrow navigation, and add-group behavior.
9. Phase 20 first captured the current dark Today card, which was nearly flat and measured about `333×155.7`; the scoped dark-mode override restored the approved gradient/border/shadow and fixed the empty-state height to `333×153`. The post-fix side-by-side comparison passed without P0/P1/P2 findings.
10. Phase 21 first comparison exposed 12px of inherited repository padding that shifted all content inward. The final scoped override resets that padding, aligning the repository header, toolbar, selected rail, row borders, and content column to the reference while preserving responsive sidebar width.

## Follow-up Polish

- P3: the source prototype's bilingual UI/data model is not migrated in this release because production has an established single-language persisted schema. A future schema migration can add per-language task content without risking existing user data.

final result: passed
