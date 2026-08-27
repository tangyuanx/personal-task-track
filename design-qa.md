# Design QA — Processing Flow Tree

## Scope

Rebuild the processing-flow hierarchy from the supplied visual reference and make the node detail page appear only after a node is selected.

## Evidence

- Source reference: `/var/folders/6r/6tb8rrdx2k38kb0mp8gqt6c80000gn/T/codex-clipboard-89f5a87d-3826-49f0-9113-693c4c0233b5.png`
- Source dimensions: 529 × 341 px
- Implementation screenshot: `/Volumes/T7/work/personal-task-track/.planning/flow_tree_reference_20260827/implementation-tree.png`
- Detail-page screenshot: `/Volumes/T7/work/personal-task-track/.planning/flow_tree_reference_20260827/implementation-detail-final.png`
- Implementation viewport: 1280 × 720 px

## Visual comparison

| Area | Reference | Implementation | Result |
|---|---|---|---|
| Root inset | Marker centered about 33 px from the tree canvas edge | Marker centered about 32 px from the processing-flow canvas edge | Passed |
| Hierarchy step | Nested markers advance about 48 px | `--tree-depth` advances 48 px | Passed |
| Row rhythm | Compact 26–29 px rows | 29 px minimum row height | Passed |
| Tree connector | Thin gray-green vertical rails and elbows | 1 px `#d3ddda` rails and 42 px elbows terminating at the next marker | Passed |
| Node marker | Small teal disc/ring marker | Bundled Feather `disc` icon at 12 px | Passed |
| Status badge | Inline TODO / DOING / DONE chips | Inline lowercase chips retain the reference palette while following the final annotated interaction copy | Passed |
| Surface | Flat near-white canvas without node cards | Flat canvas; no node borders, card radii, or shadows | Passed |
| Completed state | DONE chip is struck through, title remains readable | DONE chip is struck through; title is not struck through | Passed |

## Interaction verification

| Check | Evidence | Result |
|---|---|---|
| Default detail state | Rendered page contains no `.node-detail-page` and no `.has-node-page` | Passed |
| Open detail | Clicking a node title produces one `.node-detail-page` and one split layout | Passed |
| Detail placement | Right page starts at the split boundary and remains at scrollTop 0 | Passed |
| Return to tree | “返回处理流” removes the detail page and restores the full-width tree | Passed |
| Detail hierarchy | Only the complete node path remains; parent and depth rows are removed | Passed |
| Status editing | Clicking a lowercase tree badge cycles `todo → doing → done → blocked → todo` without opening details; the detail page shows only the current status below the title | Passed |
| Metadata | Only the latest modification time remains, beside the title | Passed |
| Node actions | Redundant child/sibling/delete footer is absent; shortcuts and context menu remain available | Passed |
| Existing node behavior | Collapse, status action, context menu, drag handle, title editing, and hierarchy rendering remain wired | Passed |

## Iteration history

1. Replaced the permanent empty inspector with conditional detail-page rendering.
2. Reordered each row to marker → status badge → title and replaced text-symbol controls with the bundled Feather icon sprite.
3. Matched the reference’s 48 px hierarchy advance and compact row rhythm.
4. Fixed node-title clicks so they open the detail page despite editable-field event isolation.
5. Prevented automatic record focus from scrolling the newly opened detail page away from its header.
6. Captured the expanded default tree and selected-node detail state in the in-app browser and compared them with the source reference.
7. Applied browser annotations: removed the detail kicker, parent/depth rows, extra timestamps, and node-action footer; moved the latest modification time beside the title; converted status to a horizontal segmented action row; and restyled the record-save action.
8. Recaptured the refined detail page and confirmed the requested information hierarchy visually.
9. Applied the final browser annotations: made lowercase status badges directly clickable with the annotated cycle order, removed the detail status selector, placed the current status below the title, shortened the save action to “保存”, and increased the latest-modified text to 12 px.
10. Click-tested all four status transitions in the in-app browser, confirmed the detail page stayed closed during badge clicks, and recaptured the selected-node detail state.

final result: passed
