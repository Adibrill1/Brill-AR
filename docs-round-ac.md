# Round AC: self-contained JSON imports and curve validation

Import audit found arbitrary asset URL strings were passed to fetch. JSON imports are now restricted to embedded supported-media base64 data URLs before any asset fetch, capped20MB per asset/60MB total/121assets. This is a preventive validation fix, not an observed attack.

Added id uniqueness/safe characters, known element types, finite numeric fields, at most60elements/1000keys per timeline, key times0..3600, finite numeric keys, invertible6-number XY-map validation and nonnested/single-membership group references. Matching server id/key/map validations reject malformed public payloads. Backend remains undeployed.

Regression submits six malformed fixtures to both local import and authenticated publish: external URL, duplicate id, negative key time, string numeric key, singular map, missing group child. All rejected; external URL fetch count is zero. All14browser fixtures pass together. Previous FBX/GIF/ZIP/MOV/stable-publish tests also pass. No new visual changes claimed.

Stable import identity behavior unchanged: imports create new local copy rather than overwriting existing experience. Production upload/host isolation, phone and format-fidelity gaps remain.
