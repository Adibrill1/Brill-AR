// End-to-end spike test: feeds the marker into Chromium as a fake camera and drives
// the full chain: page load -> camera -> marker detection -> AR -> 10s recording -> saved blob.
// Usage (from a dir with playwright installed): node e2e_test.js <spikeDir> <outDir>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const spikeDir = process.argv[2] || path.resolve(__dirname, '..');
const outDir = process.argv[3] || path.join(spikeDir, 'tools', 'e2e-out');
const PORT = 8735;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: spikeDir });
  await new Promise((r) => setTimeout(r, 1000));

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: [
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${path.join(spikeDir, 'assets', 'fake_camera.y4m')}`,
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 850 } });
    page.on('console', (m) => { if (m.type() === 'error') console.log('[page-err]', m.text()); });
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));

    console.log('1. loading page');
    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.screenshot({ path: path.join(outDir, '1-start.png') });

    console.log('2. starting AR (camera permission + engine init)');
    await page.click('#startBtn');
    await page.waitForFunction(() => window.__state.started || window.__state.error, null,
      { timeout: 120000, polling: 500 });
    let s = await page.evaluate(() => window.__state);
    if (s.error) throw new Error('engine failed: ' + s.error);
    console.log('   engine started');

    console.log('3. waiting for marker detection');
    const t0 = Date.now();
    await page.waitForFunction(() => window.__state.targetFound, null,
      { timeout: 180000, polling: 250 });
    console.log(`   marker detected after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await new Promise((r) => setTimeout(r, 2500)); // let AR content animate
    await page.screenshot({ path: path.join(outDir, '2-ar-active.png') });

    console.log('4. recording 10 seconds');
    await page.click('#recBtn');
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(outDir, '3-recording.png') });
    await page.waitForFunction(() => window.__state.blobSize > 0, null,
      { timeout: 30000, polling: 500 });
    s = await page.evaluate(() => window.__state);
    console.log(`   recording done: ${s.blobSize} bytes, mime=${s.mime}`);
    await page.screenshot({ path: path.join(outDir, '4-result.png') });

    console.log('5. extracting recorded video');
    const b64 = await page.evaluate(async () => {
      const v = document.getElementById('playback');
      const blob = await (await fetch(v.src)).blob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      }
      return btoa(bin);
    });
    const ext = s.mime.includes('mp4') ? 'mp4' : 'webm';
    const vidPath = path.join(outDir, `keepsake.${ext}`);
    fs.writeFileSync(vidPath, Buffer.from(b64, 'base64'));
    console.log('   saved', vidPath, fs.statSync(vidPath).size, 'bytes');

    console.log('\nSPIKE CHAIN PASSED: load -> camera -> detect -> AR -> record -> save');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error('SPIKE FAILED:', e); process.exit(1); });
