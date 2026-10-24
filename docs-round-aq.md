# Round AQ: model file-input boundary

Model file input previously checked only4magic bytes. Added shared GLB structural check:20MBbound, exact declared length/version2, aligned/bounded chunks, first JSON chunk≤4MB, glTF2asset version. Recursive URI scan rejects non-data core or extension references before model enters local record; no remote fetching. ZIP-wrapped GLB and conversion outputs pass through same final check.

Actual file-input test rejects magic-only, wrong declared length, external core buffer and external extension URI; valid authored multiclip GLB imports. Bare embedded glTF and named-model UI regressions pass. This validates container/dependency boundary, not every mesh/accessor/extension semantic. JSON experience imports still validate outer embedded-media schema rather than decoding every GLB; runtime loading of imported whole experiences remains a separate validation gap. No observed attack, preventive hardening only. Local-only/stagingrc51 unchanged.
