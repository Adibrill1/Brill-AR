# Round AJ: local creator preview clocks

Canvas live time starts at experience load/state entry instead of page performance epoch. Tracks have session-only preview play/stop controls with independent clocks; state switch leaves playing track clock intact. No saved autoStart flags changed by preview toggle. Shared composition sampler accepts per-element clock so parent/state and track-child can differ; ruler scrub still intentionally samples one chosen time for all.

Actual creator manual track start/stop buttons survive state switch and sampler parent/child clock combinations tested. These assertions verify controls/clock routing, not full pixel/runtime sequence equivalence. Track pause/resume, per-state-loop and auto-next preview remain separate audit cases. After sandbox rebuild Surge session unavailable; code is local-only, staging remainsrc51. Existing access request pending; no duplicate.
