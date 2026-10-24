# Round AP: bare self-contained glTF import

A remaining format gap was bare.gltf even when all buffers/images were already embedded. File input now reuses bounded ZIP dependency/document validator with an in-memory single-file archive and outputs self-contained GLB. No network/filesystem dependency resolution added. Missing relative buffers fail with ZIP-packaging guidance. Same20MB/final bounds and unsupported external-extension URI rejection apply.

Actual editor file input verifies embedded triangle glTF stored as GLB magic/type. Second file with missing external.bin is rejected with ZIP guidance and element count unchanged. All ZIP extraction/dependency bound tests pass. No new scene-rendered fidelity claim; prior glTF→GLB scene fixture covers analogous document preservation, complex extensions still need tests. Local-only since rebuild; deployedrc51 unchanged.
