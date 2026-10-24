# Round AI: zero-time timeline regression

Boundary audit found a timeline with only t=0keys was omitted from runtime driver because its duration was0. It could suppress presets in factory but never apply hide/opacity/rotation. Driver now checks key presence, not positive duration. Canvas visual sampler likewise suppresses preset for any keyed timeline, including0duration.

New fixture runs actual driver on t=0hide/opacity.2/rotation45, verifies hidden scene node and matching canvas sampler without spin preset. Discrete visibility and parent preset regressions pass. No visual UI change; no device claim. Pending AD-AH access request unchanged, no repeated ask. This small fix will join that accumulated push if approval arrives.
