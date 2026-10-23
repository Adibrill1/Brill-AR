# Round T: local creator camera-edit mode (experimental)

New editor button opens play.html?edit=1#local-id. Remote experience marker forces edit off. Local panel selects one top-level ungrouped visual element, edits x/y/width/depth/rotation, saves explicitly to local IDB or resets unsaved changes. Width preserves aspect via h update; model depth scales uniformly. Selected-only display is stated; grouped elements are deliberately excluded. No auto-save, server upload or publication. Unsaved exit prompts where browser supports it.

Mode isolates viewer tap actions, capture UI, timeline presets/clip playback and automatic track chaining; editing controls gated until image found and disabled on lost. Existing media previews may still play muted; no mic request added. Camera permission remains normal engine flow.

Synthetic A-Frame integration test (not live camera) verifies found/lost gate, object position+width scale, no auto-save, explicit save, reset to saved transform, selected-only visibility. 390px panel actual screenshot inspected after fixing input overflow. Full schema regression still passes. Command: NODE_PATH=<playwright node_modules> node tests/browser/camera-editor.cjs.

Staging rc37 includes mode but no real phone camera editing proof. Grouped layers, pointer dragging/hit testing, all sequence/track combinations, camera UI layering and iPhone/Android recognition/save-return QA remain open. It is an implementation step, not completed AR editing parity. No public buyer editing.
