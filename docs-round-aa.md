# Round AA: experimental camera-editor target-plane drag

Selected mesh raycast starts a drag only when pointer hits selected geometry, never from controls. Ray intersects an artwork-parallel plane at selected depth; world hit converts to target-local units and artwork-normalized X/Y. Group move uses exact shared helper; tracking lost cancels drag; local save remains explicit. Numeric display rounded4decimals to avoid clipped long values. Selected group's child state filters cleared for editing only.

Synthetic390px A-Frame test uses real pointer events at projected selected mesh center, moves30px/-20px, asserts X increases, no save before button, explicit save, lost tracking blocks further drag, reset saved. Screenshot inspected for readable controls only: headless compositor image does NOT demonstrate artwork/camera appearance. Scene raycast and transform assertions are behavior proof, not real tracking/device proof. Rotated physical target/depth/phone touch gesture UX remains to test.

Also found/fixed static-state + track-only case: tracking found/lost listeners were conditional on a non-track timeline driver. Now track runners always receive found/lost even with no state driver. Existing static public runtime still needs phone verification.

Current table reconciled Show/Hide rendered proof and camera group/drag synthetic scope. No zero-gap claim; PR5 push still awaiting already-delivered credential permission.
