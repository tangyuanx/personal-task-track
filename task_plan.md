# Task Plan: Personal Task Track Feature Development

## Goal
Maintain the personal task management app through scoped, low-risk improvements while preserving existing task flow behavior and release discipline.

## Current Phase
Phase 14

## Phases

### Phase 1: Requirements & Discovery
- [x] Confirm visual direction with user
- [x] Inspect existing app entry points and prior mockup
- [x] Document findings in findings.md
- **Status:** complete

### Phase 16: Sidebar Bottom-Anchor Regression
- [x] Identify the v0.1.47 task-list flex override as the regression source
- [x] Restore the task repository as the flexible sidebar region
- [x] Restore task groups and the footer to the bottom edge for populated and empty groups
- [x] Validate, package, and publish v0.1.48
- **Status:** complete

### Phase 15: Pane Performance, Node Status, and Empty Group Fixes
- [x] Cache the mounted Knowledge Notes editor during pane switches
- [x] Keep status and updated time as the final flow columns
- [x] Replace prominent node-state pills with restrained green status text
- [x] Make node context-menu status actions mutually exclusive
- [x] Stop empty task groups from stretching the sidebar task list
- [x] Run release validation, package both desktop targets, and publish v0.1.47
- **Status:** complete

### Phase 2: Design Structure
- [x] Define the redesigned static page layout
- [x] Decide visual language, information hierarchy, and responsive constraints
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Static Mockup Implementation
- [x] Create a new Product Design standalone mockup file under mockups/
- [x] Use realistic Chinese task content and expected controls
- [x] Keep production files unchanged
- [x] Create a simpler less decorative iteration based on user feedback
- [x] Create a revised Product Design iteration based on the previous richer version
- **Status:** complete

### Phase 4: Verification
- [x] Inspect the static page source for layout completeness
- [x] Visually verify the mockup if browser control is available
- [x] Document verification results
- **Status:** complete

### Phase 5: Delivery
- [x] Provide the mockup path to the user
- [x] Summarize design choices and invite review before implementation
- **Status:** complete

### Phase 6: Production Implementation
- [x] Fast-forward local main to latest origin/main before editing
- [x] Add Milkdown/Crepe dependency and local browser bundle build script
- [x] Load the generated Milkdown vendor JS/CSS from index.html
- [x] Replace the node-detail textarea/preview mode with a Milkdown host and fallback textarea
- [x] Change node detail from fixed right pane/resizer to click-open overlay
- [x] Keep old note persistence path by writing Milkdown changes through existing edit/save flow
- **Status:** complete

### Phase 7: Verification
- [x] Run npm run check
- [x] Browser-verify node detail overlay opens from an existing node
- [x] Browser-verify Milkdown/ProseMirror mounts and fallback textarea is not used
- [x] Run git diff --check
- **Status:** complete

### Phase 8: Review Date Range + Task Drag Ordering
- [x] Inspect task review modal date filtering and task sidebar rendering/saving
- [x] Add custom date-range controls to task review
- [x] Add compact drag handle and drag/drop ordering to task list
- [x] Preserve task selection, group filtering, and existing save flow
- [x] Update planning files with decisions and verification
- [x] Run npm run check and git diff --check
- **Status:** complete

### Phase 9: Final Redesign Alignment + Node Detail Fixes
- [x] Compare current production UI against the final approved static direction
- [x] Expand node detail overlay to cover most of the app and add fullscreen support
- [x] Fix Milkdown toolbar/icon sizing/order so it feels like a proper Milkdown editor
- [x] Ensure adding a main node focuses the new node title without opening detail
- [x] Open node detail only when clicking the record/note area
- [x] Make missing-conclusion close prompt non-blocking for other node operations
- [x] Browser-verify key interactions
- [x] Run npm run check and git diff --check
- **Status:** complete

### Phase 10: Static Mockup Visual Alignment
- [x] Re-read the final approved static direction from planning notes
- [x] Align production layout spacing with the richer final mockup
- [x] Align production palette and surface atmosphere with the final mockup
- [x] Refine sidebar, today focus, task header, brief fields, and flow table visuals
- [x] Preserve the Phase 9 node-detail behavior and Milkdown fixes
- [x] Browser-verify desktop and mobile layout
- [x] Run npm run check and git diff --check
- **Status:** complete

### Phase 11: Handoff HTML Production Implementation
- [x] Preserve and read the new handoff Markdown and design HTML in full
- [x] Compare the HTML target with the current production app and feature map
- [x] Resolve any requirement ambiguity that materially changes behavior
- [x] Safely sync local main with the latest origin/main without touching user artifacts
- [x] Implement the approved HTML-led design and interactions in production
- [x] Run project checks, build both desktop packages, and complete design QA
- [x] Release the user-facing update through the standard version/tag/push flow
- **Status:** complete

### Phase 12: Record Modal and Knowledge Milkdown Refinement
- [x] Replace the expanded node Milkdown surface with the compact HTML-style record modal
- [x] Move the Milkdown editor to the task Knowledge Notes pane
- [x] Preserve node record and task knowledge-note persistence across browser and Electron storage
- [x] Browser-verify record save/close shortcuts and Knowledge Notes Milkdown persistence
- [x] Re-run design QA, checks, desktop builds, and release flow
- **Status:** complete

### Phase 13: Living Handoff Document
- [x] Recover the latest release and planning context
- [x] Read the existing handoff document in full and identify stale prototype assumptions
- [x] Add an authoritative current-production handoff section and maintenance protocol
- [x] Verify the document against the repository and checks
- [x] Commit and push the handoff document to remote main
- **Status:** complete

### Phase 14: Milkdown, Flow Guidance, and Sidebar Fidelity Fixes
- [x] Recover current repository and inspect all three user screenshots
- [x] Compare production selectors/behavior with `task-track.html`
- [x] Tighten Milkdown ordered/unordered list indentation and vertical rhythm
- [x] Make pasted images render and persist in task Knowledge Notes
- [x] Remove collapsed-flow orphan rail and match the HTML guidance copy/layout
- [x] Replace the oversized sidebar new-task card with the HTML-style hint row
- [x] Browser-verify the affected desktop/mobile states and update design QA
- [x] Validate, build, update the living handoff, and release the next patch version
- **Status:** complete

## Key Questions
1. Should this edit production frontend files? Answer: no, create static page first.
2. What style should guide the mockup? Answer: efficiency tool first, with a touch of today-focus atmosphere.
3. What existing product structure should be preserved? Answer: task groups/sidebar, focused task list, task flow/detail workspace.
4. Should the approved direction now be applied to the project? Answer: yes, with minimal impact on existing features.
5. Which editor should node detail use? Answer: an embedded open-source Milkdown editor.
6. Should task review support custom date ranges? Answer: yes, users should be able to choose ranges such as 6.13-6.20.
7. Should sidebar tasks support manual ordering? Answer: yes, add a small left-side drag handle and enable drag reordering.
8. Should the production frontend match the final static redesign? Answer: yes, the current production UI drifted and should be realigned.
9. Should node detail dominate the workspace? Answer: yes, it should cover most of the page and support fullscreen.
10. When should node detail open? Answer: only when clicking the record/note area, not when adding or editing node titles.
11. Should the production visual layout also match the final static mockup? Answer: yes, update spacing, color atmosphere, and layout feel, not just behavior.
12. Where should Milkdown live? Answer: in task-level Knowledge Notes; node records use a compact simple modal matching `task-track.html`.
13. How should future sessions recover project context? Answer: read the tracked living handoff first, then planning files and repository status; update the handoff whenever architecture, behavior, validation, release, or pending work changes.

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Build a standalone file in mockups/ | Lets the user review direction before production changes. |
| Keep the layout app-like and dense | The app is an operational personal task manager, not a landing page. |
| Add atmosphere through a focus strip and restrained color accents | Matches the user's desire for efficiency with some today-focus mood. |
| Use a three-pane redesign | Keeps task navigation, task flow, and selected node detail visible at once for efficient daily work. |
| Create a new Product Design mockup rather than overwrite previous one | Keeps prior review artifact available and makes the plugin-requested design explicit. |
| Serve mockup locally for browser verification | Browser policy blocked file://, while localhost is the supported local preview path. |
| Remove recommendation/rhythm content from the next iteration | User said they do not need recommended rhythm and prefer a simple direct personal task management tool. |
| Use mockups/simple-task-manager-redesign.html as the current preferred direction | It directly responds to the latest feedback: simpler, less decorative, no recommendation/rhythm content. |
| Use mockups/product-design-revised-redesign.html as the latest preferred direction | User wanted to return to the prior richer version with specific removals and an expandable Markdown node detail panel. |
| Hide node detail by default and show it as a large overlay on node click | Preserves workspace width until a specific node needs note-taking, then gives Markdown enough room. |
| Bundle Milkdown locally with esbuild | The app currently loads plain scripts from index.html, so a local browser bundle avoids introducing a larger frontend framework/build migration. |
| Keep the existing edit/save data flow for node notes | Minimizes functional risk by only changing the editor surface, not the storage contract. |
| Provide a textarea fallback if Milkdown fails to mount | Preserves note editing in degraded environments. |
| Treat the record/note cell as the only node-detail opener | Prevents accidental detail expansion when adding nodes, editing titles, or navigating from today's focus. |
| Add a fullscreen mode to the large node-detail overlay | Gives long Markdown notes enough room without replacing the task flow permanently. |
| Disable Crepe TopBar and constrain Milkdown toolbar icons through scoped CSS | Avoids oversized and visually chaotic editor controls while preserving the editor surface. |
| Apply the final static direction through CSS-first visual refinement | The current production structure already matches the functional model, so CSS-first alignment reduces regression risk. |
| Use a warmer paper workspace with moss focus accents for the default focus tone | This matches the final static mockup mood better than the previous blue focus tone while staying task-tool appropriate. |
| Keep the original v1.3.1 handoff as a clearly labeled historical appendix | It preserves the user's detailed design rationale while preventing stale prototype facts from overriding current Electron production state. |
| Treat the handoff as a completion artifact for future sessions | The user explicitly wants new sessions to continue without relying on chat history, so architecture, current work, validation, release, and pending decisions must stay Git-tracked and current. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| None | 1 | Not applicable |
| Browser blocked file:// URL | 1 | Started a local 127.0.0.1 static server and verified through localhost |
| Milkdown loading placeholder remained after editor mounted | 1 | Cleared the host element before creating the Crepe editor and rebuilt the vendor bundle |
| Milkdown toolbar still rendered 32px icons after the first CSS pass | 1 | Added scoped overrides for `.milkdown-icon` SVGs and toolbar items, then browser-verified max SVG size at 16px |
| Mobile node detail became too short after the larger desktop visual layout | 1 | Changed mobile node detail to a fixed near-fullscreen overlay and verified 359x828 at 390x844 |
| External-drive AppleDouble files in `.git/objects/pack` trigger `non-monotonic index` warnings | 1 | Moved the three metadata files to `/tmp/personal-task-track-appledouble-backup/` before repository sync |
| Browser tab verification timed out during an immediate post-render note readback | 1 | Took a fresh DOM snapshot, reloaded, reopened Knowledge Notes, and confirmed the saved content through the rendered textbox |
| Git staging was rejected because the Codex action usage limit was reached | 1 | Stop without workarounds; keep all verified local changes and resume staging/commit/tag/push after the limit resets |
| Knowledge-note browser typing inserted the new heading before existing content | 1 | Verified persistence rather than ordering as the functional requirement; the editor remained fully editable and stored the Milkdown document correctly |
| Staged handoff failed `git diff --cached --check` because eight newly added Markdown lines used trailing spaces for hard breaks | 1 | Removed the trailing spaces and kept the blockquote readable as consecutive lines |
| Product Design user-context preflight was initially called from the plugin root | 1 | Located and used the actual script under `skills/user-context/scripts/`; no saved context exists, so current screenshots, HTML, and repository remain authoritative |
| The first combined patch missed the final `.flow-hint` CSS block because the expected context differed | 1 | Split the patch by file/selector and applied each scoped change against freshly inspected source |
| Browser rail measurement used unavailable `parseFloat` inside the restricted read-only page scope | 1 | Took a fresh snapshot and re-measured with `Number(String(value).replace("px", ""))` |
| Crepe's default pasted-image upload returned temporary blob URLs that broke after editor recreation | 1 | Overrode ImageBlock `onUpload` to persist data URLs, then verified a real 966×700 PNG before and after full reload |
| Reloading the local QA comparison tab was rejected by browser security policy | 1 | Stopped further browser actions on that tab; retained the already saved combined comparison and the separately captured same-state desktop/mobile evidence |
| Pre-release remote tag sync was rejected because the Codex action usage limit was reached | 1 | Did not retry or work around the limit; used the already synced v0.1.45 tag state to prepare the local 0.1.46 candidate and left packaging/push pending |

## Notes
- Phase 9 production implementation is complete and ready for release.
- Phase 10 visual alignment is complete and ready for release.
- Avoid a marketing hero; the first screen should be the usable product surface.
