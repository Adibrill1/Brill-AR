# Round AH: parent presets in canvas

Shared visual sampler now samples spin14s linear rotation, float2.6s alternate sine.03target units and pulse1.6s alternate sine1..1.08, disabled if element has timeline. Canvas composition applies parent and child presets with same sampled time. Removed old canvas-only approximation that ignored parent presets and didn't rotate text preset consistently. Live button explicitly restarts drawing after scrub.

Actual A-Frame animation seek vs shared canvas expected world position tested start/mid/end of all3parent presets (tolerance.002target units). Actual ruler pointer scrub0/.7/1.4s spins red child while blue remains; red centroid movement and screenshot inspected. This validates same-clock deterministic preset transforms, not independent track-clock preview or real device timing/performance. Tests do not imply3D geometry fidelity in2D.
