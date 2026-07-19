// Adaptive pose stabilizer — the "both worlds" fix for jitter vs. lag.
//
// MindAR's built-in one-euro filter forces a single tradeoff point: smooth enough
// to kill standstill jitter and it lags badly during motion ("the artwork escapes").
// Instead we keep MindAR's filtering light (near-raw, minimal lag) and add our own
// error-proportional smoothing on top:
//   tiny pose error  (sensor jitter)  -> heavy smoothing, elements stand rock still
//   large pose error (phone movement) -> blend factor rises to 1, instant catch-up
//
// The content lives in a holder group we control, mirroring the MindAR anchor's
// matrix through this adaptive blend every rendered frame.

export const STABILIZER_PRESETS = {
  off:  { base: 1.0,  gain: 0 },    // raw tracking (for A/B comparison via ?stab=off)
  soft: { base: 0.08, gain: 3.5 },
  firm: { base: 0.16, gain: 7 },    // default: still at rest, catches up within ~2 frames
};

export function createStabilizer(THREE, preset = 'firm') {
  const { base, gain } = STABILIZER_PRESETS[preset] || STABILIZER_PRESETS.firm;
  const tPos = new THREE.Vector3();
  const tQuat = new THREE.Quaternion();
  const tScale = new THREE.Vector3();

  return {
    // holder: our group in the scene; anchorGroup: MindAR-driven anchor group
    update(holder, anchorGroup) {
      if (!anchorGroup.visible) {
        holder.visible = false;
        return;
      }
      anchorGroup.matrix.decompose(tPos, tQuat, tScale);
      if (!holder.visible) {
        // first frame after (re)detection: snap, never fly in
        holder.visible = true;
        holder.position.copy(tPos);
        holder.quaternion.copy(tQuat);
        holder.scale.copy(tScale);
        return;
      }
      const err = holder.position.distanceTo(tPos);
      const alpha = Math.min(1, base + err * gain);
      holder.position.lerp(tPos, alpha);
      holder.quaternion.slerp(tQuat, alpha);
      holder.scale.lerp(tScale, alpha);
    },
  };
}
