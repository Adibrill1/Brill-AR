// Perceptual image fingerprint (dHash, 64-bit) for duplicate trigger detection.
// Robust to resizing/re-encoding and small edits, so "the same artwork saved
// differently" still matches. First uploader wins; later identical uploads are blocked.

export function dHash(img) {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, 9, 8);
  const d = x.getImageData(0, 0, 9, 8).data;
  const gray = [];
  for (let i = 0; i < 72; i++) {
    gray.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  }
  let bits = '';
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 8; col++) {
      bits += gray[r * 9 + col] > gray[r * 9 + col + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
}

// distance at or below this counts as "the same image"
export const DUPLICATE_THRESHOLD = 8;
