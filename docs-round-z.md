# Round Z: pointer and reset/media follow-through

Actual creator canvas pointer events move group center by+.1/+.05 and corner-scale1.2x. Persisted child/group translation and width ratio asserted. Screenshot inspected: A/B enclosed in blue selected group bounds with visible corner handle. This is creator2D canvas pointer proof, not live-camera dragging.

Found reset persistence bug after Y: camera group's unsaved transform also changed child's affine timeline map, but reset restored only geometry. Reset now restores saved timeline fields too. Fixture adds a child elastic curve, saves, changes group X/rotation, resets, saves again and compares timeline+geometry to original saved snapshot.

Actual WAV currentTime advances; real timeline driver hides/shows parent at.1/.25s while media monitor pauses/resumes WAV. Existing state/track tests pass. Autoplay skip now marks blocked media eligible for resume when its group becomes visible, avoiding an initially hidden video staying paused forever.

No camera-device/phone audio output proof. PR5 still open/unmerged at23:30, remote73054a5, push waiting on already-delivered vault approval. Do not resend access request merely from this quiet interval.
