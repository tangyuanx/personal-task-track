# Task Plan: Product Design Frontend Redesign + Milkdown Detail Editor

## Goal
Apply the approved revised frontend direction to the real personal task management app with minimal disruption, and replace the old node-detail Markdown textarea with an embedded Milkdown editor.

## Current Phase
Phase 7

## Phases

### Phase 1: Requirements & Discovery
- [x] Confirm visual direction with user
- [x] Inspect existing app entry points and prior mockup
- [x] Document findings in findings.md
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

## Key Questions
1. Should this edit production frontend files? Answer: no, create static page first.
2. What style should guide the mockup? Answer: efficiency tool first, with a touch of today-focus atmosphere.
3. What existing product structure should be preserved? Answer: task groups/sidebar, focused task list, task flow/detail workspace.
4. Should the approved direction now be applied to the project? Answer: yes, with minimal impact on existing features.
5. Which editor should node detail use? Answer: an embedded open-source Milkdown editor.

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

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| None | 1 | Not applicable |
| Browser blocked file:// URL | 1 | Started a local 127.0.0.1 static server and verified through localhost |
| Milkdown loading placeholder remained after editor mounted | 1 | Cleared the host element before creating the Crepe editor and rebuilt the vendor bundle |

## Notes
- Production implementation is now in progress after user approval.
- Avoid a marketing hero; the first screen should be the usable product surface.
