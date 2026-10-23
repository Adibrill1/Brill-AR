# Round L: ZIP glTF with external files

The editor accepts a ZIP containing one glTF 2.0 JSON model with its relative buffer and image files. It embeds the referenced files as data URIs, preserves the JSON document, and wraps the result as a self-contained GLB. Existing GLB-in-ZIP support is retained. No remote dependencies are fetched, and no archive paths are written to disk.

## Verification
`node tests/gltfzip.cjs` covers preservation of meshes/materials, exact buffer/image bytes, GLB length, missing buffer, multiple models, network/absolute/out-of-archive paths, encoded absolute paths, duplicate canonical filenames, extension URIs, entry count, expanded size, per-entry size and truncated archive.

A separate clean sandbox Chrome session ran the deployed rc29 editor's real UI file-input flow: new experience, artwork, ZIP glTF model with separate BIN and PNG. It saved a 912-byte model/gltf-binary asset. The 3D preview loaded a 3-vertex mesh with a 2x2 texture; actual scene captureStream readback shows the textured red triangle over white artwork. The scene image was inspected. A ZIP without a model produced a clear Hebrew error. This was sandbox Chrome against the live staging site, not the user's cloud-browser session or a phone.

Bounds: 20MB input, 100 entries, 20MB per expanded entry, 60MB total expanded entries, final GLB <=20MB. Central-directory metadata is checked before any inflation. References in core buffers/images are embedded; non-data URIs in extensions are rejected. Canonical duplicate paths rejected. No nested ZIP recursion. Only one model is accepted to avoid silently choosing the wrong artwork.

## Still open
Phone AR test; complex animated/multi-extension archive fixtures; runtime extension support is unchanged and is not guaranteed merely by preserving JSON. Bare external-file glTF upload still needs its ZIP or native GLB export. OBJ geometry-only fidelity caveat unchanged. FBX and MOV remain separate work.
