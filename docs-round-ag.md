# Round AG: original morph and skin fixture rendering

Added two original minimal binary GLBs, generated from reviewed script: one triangle morph position target, one3-vertex mesh with one fully weighted joint. Actual GLTFLoader/AnimationMixer/component/renderer at0/1s: morph red area199→967pixels (over4x); skinned triangle centroidX357.5→441.3 with Ydifference<.2. Identical crops inspected. All model control/UI/multi-clip fixtures rerun green.

This is a bounded support proof for one morph target and one joint, not complex rig fidelity, inverse-bind hierarchies, multi-joint blending, animation clip blending, or phone performance. No implementation change was needed for these two paths. Auto-fit uses loader bounding box; deforming model framing can remain conservative. Original generated test assets only, no proprietary copying.
