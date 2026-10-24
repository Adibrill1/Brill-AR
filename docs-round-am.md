# Round AM: canvas state-loop clock

Canvas live state clock now replays after maximum non-track one-shot duration when selected state's loop flag is enabled. Track timelines do not lengthen the state's loop period. Sampler regression0/1/2/2.25/5seconds maps to0/1/2/.25/1 for2sstate, and disabling loop leaves5s unchanged. All26browser fixtures pass together after recovery. Existing independent-track pixel regression also passes.

This is pure clock-boundary proof, not rendered loop-cycle timing or autoNext editor simulation. AutoNext still belongs to viewer preview; creator state tabs remain selected manually. Local-only, stagingrc51 unchanged, pending credential request unchanged. No zero-gap claim.
