# Round Q: experimental static FBX conversion

Bundled AssimpJS0.0.10 lazy worker converts a single FBX to GLB locally. No source upload, no network dependency references loaded. Before import, Hebrew warning states experimental static-only scope and possible material/feature changes, recommending source-native GLB for fidelity. Cancel aborts. Converted output checked for external URI references, animation/skin, mesh presence and result size. Unsupported complex imports rejected when detected; converter might drop a feature before these checks, so no broad fidelity claim.

Bounds:20MB source/result,30s worker timeout/termination, wrapper heap-growth cap256MB (upstream2GB). Heap cap is not a total process RSS bound. MIT wrapper/BSD Assimp licenses retained, pinned provenance/integrity documented.4MB converter lazy-loaded only after confirmation.

Proof: original ASCII FBX triangle fixture includes positions, normals and purple diffuse material. `node tests/fbx-convert.cjs` checks3 positions/3 normals, GLB magic, exact material factors within float precision, invalid input rejection. Actual live rc35 editor UI in clean sandbox Chrome: cancel0elements; accept saves1260-byte GLB; invalid FBX error; preview loads3-vertex MeshStandardMaterial, purple color and inspected actual render triangle. This is static ASCII fixture evidence, not binary/embedded-texture/complex model or animation parity. Phone QA open. Existing runtime does not play embedded skeletal clips; worker rejects exported skin/animation rather than claiming support.

No user assets, accounts, spending or production publishing involved. PR remains owner-merged only.
