# Phase26 design baseline (frozen)

The deletion-and-recovery stage's visual and interaction contract, copied
byte-for-byte from the design demo. Nothing in this directory may be edited to
suit an implementation; the implementation is compared against it.

| File | Role |
| --- | --- |
| `loop-plane-phase26-candidate.html` | The stage-26 entry page (inherits every earlier phase's stylesheet and script, in the order recorded in `DEPENDENCIES.sha256`). |
| `loop-recovery-phase26.css` | The stage's scoped stylesheet. `app/renderer/src/recovery26.css` must stay a byte copy of it. |
| `loop-recovery-phase26.js` | The stage's prototype script (page-memory only; the product does not copy it). |

`MANIFEST.sha256` covers the three files above.
`DEPENDENCIES.sha256` covers everything the entry page loads, in document
order, and points each row at the frozen copy it must stay identical to.

Source: `/Volumes/T7/work/personal-task-track/prototypes/demos` (the design prototype checkout, read-only).
Regenerate with `node probe/make-phase26-baseline.cjs`.
