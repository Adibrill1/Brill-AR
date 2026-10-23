# Round U: explicit Show/Hide timeline + active edit readability

Explicit Show/Hide buttons use the current timeline time and add a discrete visible key. Key labels say hidden/shown. Sampler holds visibility without opacity interpolation, editor canvas skips hidden layer and runtime composes _timelineVisible with _sequenceVisible to prevent a hidden state being re-enabled by its timeline.

Actual editor UI test creates Hide1s/Show2s and verifies labels. Boundary sampler .5/1/1.5/2 gives true/false/false/true. State-composition DOM test confirms hide persists and wrong-state remains hidden.390px controls/key list inspected. Full runtime rendered transitions and device remain pending.

Camera panel now opaque white and hides underlying sequence/hint overlays. Active-state390px screenshot inspected with clear fields/text; lost gate test still passes. Group edit remains excluded until transforms have a coherent persisted composition model. Direct camera drag remains open, not assumed impossible. No new phone/camera proof.
