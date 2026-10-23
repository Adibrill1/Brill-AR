# Round R: embedded model clip and parity truth fixes

First embedded glTF clip plays via THREE.AnimationMixer, loops by default and freezes under hidden ancestors or target loss. Wrapper transforms remain separate from authored model-node animation. Synthetic original GLB translation fixture visibly shifts red triangle (scene pixel centroid562→685); mixer time advances; hidden wrapper holds exact mixer time. Two render samples inspected. Shared component camera-found/lost branches are code-covered only; no real phone or skeletal/morph fixture proof. No clip selector yet.

Parity review found two real regressions hidden by earlier capability labels:
- Parallel track definitions were omitted from JSON export/import, leaving element track references without definitions. Both directions now include tracks. Browser roundtrip2tracks preserves flags, names and element binding.
- Publish server used slug only although editor sends id, giving each publish a fresh URL. Server now prefers validated id; local API test publishes same experience twice and gets same URL with updated content. node tests/publish-stability.cjs. Production service remains undeployed.

PARITY now retracts ungrounded native-only exclusion for live AR editing: it is unbuilt code/product scope. Multiple-layer row no longer claims unlimited server capacity (server limit60). Historical provenance notes explicitly subordinate to current table. Full-row unresolved list added. No zero-gap claim.
