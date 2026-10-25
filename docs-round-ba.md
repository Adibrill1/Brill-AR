# Round BA - duplicate artwork-target detection (n:1 residual)
Separate from assessTargetQuality: artworkFingerprint (16x16 dHash + entropy) is stored on rec.target.fp at artwork upload; fingerprintDistance (Hamming) <=16 against other experiences' targets appends a warning naming the other experience. Flat images are not comparable. Older experiences are fingerprinted on the fly from their stored artwork.
Verification: tests/browser/target-duplicate.cjs - distances same 0 / resized 4 / unrelated 121 / flat Infinity; editor flow warns and names the source experience, distinct target stays quiet, fp persisted.
Caveat: scope is this device's local experiences only; it does not detect duplicates against other accounts or Artivive's server. Headless only.
