# Round AR: whole-experience model boundary

Whole JSON import now runs same model container/dependency validator before saving any experience. Missing/bad model assets reject; malformed embedded model or external URI cannot bypass direct-file validation via a JSON export. Test verifies2rejects, no change to saved record count, zero external fetch and valid original gem import. Schema fixture now uses actual gem GLB bytes for model while other media remain synthetic storage bytes.

First complete-suite attempt hit an intermittent embedded-gltf fixture timing failure (record had no element when read); isolated rerun passed, then all29browser fixtures passed together. Kept this first failure visible rather than claiming uninterrupted green. No runtime/device/production effect claimed; local-only/stagingrc51 unchanged. Existing credential request unchanged.
