# Design QA — Workbench Background / Progress / Conclusion Cards

- Source visual truth: `/var/folders/6r/6tb8rrdx2k38kb0mp8gqt6c80000gn/T/codex-clipboard-b9fd13b9-0824-4a38-ad3a-beabef4ff863.png`
- Implementation screenshot: `/Volumes/T7/work/personal-task-track/.planning/workbench-three-input-cards/implementation-pass-2.png`
- Focus screenshot: `/Volumes/T7/work/personal-task-track/.planning/workbench-three-input-cards/implementation-focus.png`
- Comparison image: `/Volumes/T7/work/personal-task-track/.planning/workbench-three-input-cards/comparison-pass-2.png`
- App viewport: 1199 × 768 px, Electron light theme, device scale represented by the captured desktop screenshot.
- Source pixels: 1006 × 310 px. Source card crop: 948 × 158 px, padded to 948 × 166 px.
- Implementation pixels: 1199 × 768 px. Implementation card crop: 780 × 137 px, normalized to 948 × 166 px.
- Comparison state: same three-card light-theme workbench region; source contains illustrative copy while implementation contains the user's real task values.

## Full-view comparison evidence

The live app keeps the existing page hierarchy and places three equal cards in the same workbench position. The cards use the source's quiet white surface, low-contrast green-gray border, rounded corners, restrained shadow, green line icons, compact title row, and muted multiline body text. The Progress card retains a real percentage ring in the upper-right; the Conclusion card retains the matching edit affordance.

## Focused-region comparison evidence

`comparison-pass-2.png` stacks equal-width normalized card crops: source on top and implementation below. The card grid, individual framing, title/icon alignment, upper-right actions, typography hierarchy, and spacing correspond closely. The implementation intentionally omits the source's non-editable checklist bullets and status pills because the product requirement is three independent freeform inputs.

## Required fidelity surfaces

- Fonts and typography: passed. Existing application font remains consistent with the rest of the product; weight, size, line height, and muted body hierarchy match the reference direction.
- Spacing and layout rhythm: passed. Three equal cards, compact gaps, 14 px radius, internal padding, and header/body separation align with the reference.
- Colors and visual tokens: passed. Existing project green is used for icons, progress, hover, and focus; card surfaces and borders remain quiet and consistent with the app.
- Image quality and asset fidelity: passed. Header icons use the official Feather v4.29.2 sprite; no placeholder or improvised raster asset is used.
- Copy and content: passed with expected product difference. Labels remain 背景 / 进展 / 结论, while body content remains user-authored task data.

## Interaction evidence

- Accessibility exposes all three controls as settable text entry areas.
- Clicking the Progress body focuses the existing textarea without changing its content.
- Focus is shown at card level with a restrained green frame; no orange textarea outline appears.
- Progress percentage is calculated from the existing task node summary rather than hard-coded.

## Comparison history

### Pass 1 — blocked

- P1: Progress ring and Conclusion edit icon wrapped below their titles.
- Fix: strengthened the card-child header selector and defined a full-width two-column grid.

### Pass 2 — passed

- The Progress ring and Conclusion edit icon are aligned in the upper-right.
- No actionable P0, P1, or P2 fidelity issues remain.

## Follow-up polish

- P3: Real task copy may naturally produce different card density than the illustrative reference; the textarea scroll behavior handles longer content without changing card layout.

final result: passed
