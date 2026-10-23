# Round AD: canvas group timeline composition

Cross-view audit found2D creator canvas skipped group wrappers entirely, so parent timeline move/rotate/scale/opacity/Show-Hide never affected child canvas preview even though runtime did. Added shared artwork-space composition sampler: child sample composed with parent relative-to-base translation/rotation/scale/depth, opacity multiplied, visibility combines child+parent+state. Canvas uses it at scrub/live time. Runtime factory/driver unchanged.

Actual ruler pointer scrub0/1/2.1s: red A moves/rotates, max red235→59 (quarter opacity), then0red pixels; fixed blue B remains. Contact sheet inspected. Prior runtime group rendered regression and whole-schema roundtrip pass. This closes specific timeline group canvas mismatch, not all preview equivalence: parent preset spin/float/pulse composition, independent track clocks and3D geometry/depth on2D remain separate checks.

PR5 merged76179ba, this is first new local commit after that base. Do not ask for access or a new PR per tiny round; batch.
