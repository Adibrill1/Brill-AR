// Headless compile of assets/marker.png -> assets/targets.mind via compile.html.
// Run from a dir where `playwright` is installed: node compile_marker.js <spikeDir>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const spikeDir = process.argv[2] || path.resolve(__dirname, '..');
const PORT = 8734;

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: spikeDir });
  await new Promise((r) => setTimeout(r, 1000));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => console.log('[page]', m.text()));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.goto(`http://localhost:${PORT}/compile.html`);
    await page.waitForFunction(
      () => window.__status === 'done' || String(window.__status).startsWith('error'),
      null, { timeout: 540000, polling: 2000 },
    );
    const status = await page.evaluate(() => window.__status);
    if (status !== 'done') throw new Error(status);
    const b64 = await page.evaluate(() => window.__mindB64);
    const out = path.join(spikeDir, 'assets', 'targets.mind');
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log('wrote', out, fs.statSync(out).size, 'bytes');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
