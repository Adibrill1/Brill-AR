# Round AN: stable updates at capacity

Server audit found experience-count check rejected updates when storage was full, breaking stable buyer link update even though no new slot was needed. Capacity now applies only to new ids. Writes use mode0600 temporary file plus atomic rename and cleanup, avoiding partial JSON read during replacement. Optional isolated storage-dir/lower-cap config supports deterministic testing.

One-slot store test: first publish200, second new id507, existing-id update200/readback updated, exactly one private JSON/no temp. Stable-publish and whole-schema regressions pass. Backend remains undeployed; atomic filesystem replacement is not backup/multiuser ownership/sync. No public data published.
