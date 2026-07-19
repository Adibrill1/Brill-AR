// Full artist-portal flow test, headless:
// profile -> crop/rotate editor -> weak image blocked by quality gate -> good image passes
// -> two elements (cover video + upright floating image) -> live 3D preview builds
// -> soundtrack -> submit -> admin approve -> AR view detects the trigger (fake camera).
// Usage: node e2e_portal_test.js <repoRoot> <assetsDir> <outDir>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = process.argv[2] || path.resolve(__dirname, '..', '..');
const assetsDir = process.argv[3] || __dirname;   // flat.png + marker_hd.png + testvideo.webm
const outDir = process.argv[4] || path.join(__dirname, 'e2e-out');
const PORT = 8737;

async function pickImage(page, file) {
  await page.setInputFiles('#imgInput', file);
  await page.waitForSelector('#cropEditor', { state: 'visible' });
  await page.click('#cropApply');
  await page.waitForFunction(() => window.__portal.imageReady);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: repoRoot });
  await new Promise((r) => setTimeout(r, 1000));

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: [
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${path.join(repoRoot, 'spike', 'assets', 'fake_camera.y4m')}`,
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('[page-err]', m.text()); });

    console.log('1. portal loads, profile saves');
    await page.goto(`http://localhost:${PORT}/portal/index.html?backend=local`);
    await page.fill('#pName', 'Test Artist');
    await page.fill('#pCountry', 'Israel');
    await page.click('#saveProfileBtn');
    await page.waitForFunction(() => document.getElementById('profileNote').textContent.includes('✓'));

    console.log('2. crop editor: rotate 4x (full circle) + apply; auto quality grades weak image poor');
    await page.setInputFiles('#imgInput', path.join(assetsDir, 'flat.png'));
    await page.waitForSelector('#cropEditor', { state: 'visible' });
    for (let i = 0; i < 4; i++) await page.click('#rotateBtn');
    await page.click('#cropApply');
    await page.waitForFunction(() => window.__portal.qualityDone || window.__portal.error, null, { timeout: 300000 });
    let grade = await page.evaluate(() => window.__portal.lastGrade);
    console.log('   flat image grade:', grade);
    if (grade === 'good') throw new Error('flat image unexpectedly graded good — scoring broken');

    console.log('3. rich image passes quality (auto-run)');
    await page.evaluate(() => { window.__portal.qualityDone = false; window.__portal.imageReady = false; });
    await pickImage(page, path.join(assetsDir, 'marker_hd.png'));
    await page.waitForFunction(() => window.__portal.qualityDone || window.__portal.error, null, { timeout: 300000 });
    grade = await page.evaluate(() => window.__portal.lastGrade);
    console.log('   marker grade:', grade);
    if (grade === 'poor') throw new Error('marker graded poor — scoring broken');

    console.log('4. element 1: video with full-cover fit');
    await page.click('#addElBtn');
    await page.setInputFiles('.el-card:nth-child(1) [data-role=file]', path.join(assetsDir, 'testvideo.webm'));
    await page.waitForFunction(() =>
      document.querySelector('.el-card:nth-child(1) [data-role=info]').textContent.includes('נטען בהצלחה'));
    await page.check('.el-card:nth-child(1) [data-role=fit]');

    console.log('5. element 2: upright floating image beside the trigger');
    await page.click('#addElBtn');
    await page.selectOption('.el-card:nth-child(2) [data-role=kind]', 'image');
    await page.setInputFiles('.el-card:nth-child(2) [data-role=file]', path.join(assetsDir, 'flat.png'));
    await page.waitForFunction(() =>
      document.querySelector('.el-card:nth-child(2) [data-role=info]').textContent.includes('נטען בהצלחה'));
    await page.check('.el-card:nth-child(2) [data-role=upright]');
    await page.evaluate(() => {
      const z = document.querySelector('.el-card:nth-child(2) [data-t=z]');
      z.value = '0.9';
      z.dispatchEvent(new Event('input', { bubbles: true }));
    });

    console.log('5b. slider reset restores the default');
    await page.click('.el-card:nth-child(2) [data-reset=z]');
    const zAfterReset = await page.evaluate(() =>
      document.querySelector('.el-card:nth-child(2) [data-t=z]').value);
    if (parseFloat(zAfterReset) !== 0.25) throw new Error('slider reset broken, z=' + zAfterReset);
    await page.evaluate(() => {
      const z = document.querySelector('.el-card:nth-child(2) [data-t=z]');
      z.value = '0.5';
      z.dispatchEvent(new Event('input', { bubbles: true }));
    });

    console.log('6. live 3D preview builds both elements');
    await page.waitForFunction(() => window.__portal.previewCount === 2, null, { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(outDir, '1-editor-preview.png'), fullPage: true });

    console.log('7. soundtrack + submit');
    await page.setInputFiles('#audioInput', path.join(repoRoot, 'spike', 'assets', 'soundtrack.wav'));
    await page.waitForFunction(() => document.getElementById('audioInfo').textContent.includes('נטען בהצלחה'));
    await page.fill('#titleInput', 'יצירה מרובת אלמנטים');
    await page.fill('#descInput', 'וידאו מכסה + תמונה מרחפת במאונך');
    await page.check('#rightsCheck');
    await page.waitForSelector('#submitBtn:not([disabled])');
    await page.click('#submitBtn');
    await page.waitForFunction(() => window.__portal.submitted);
    await page.waitForSelector('.chip.pending');

    console.log('7b. duplicate trigger image is blocked');
    await page.setInputFiles('#imgInput', path.join(assetsDir, 'marker_hd.png'));
    await page.waitForSelector('#cropEditor', { state: 'visible' });
    await page.click('#cropApply');
    await page.waitForFunction(() => window.__portal.dupBlocked || window.__portal.imageReady, null, { timeout: 60000 });
    const dupBlocked = await page.evaluate(() => window.__portal.dupBlocked);
    if (!dupBlocked) throw new Error('duplicate image was NOT blocked');
    console.log('   ', await page.evaluate(() => document.getElementById('imgError').textContent.slice(0, 60)));
    await page.screenshot({ path: path.join(outDir, '1b-duplicate-blocked.png') });

    console.log('8. admin approves');
    await page.goto(`http://localhost:${PORT}/portal/admin.html?backend=local`);
    await page.waitForFunction(() => window.__admin.rendered || window.__admin.error);
    await page.waitForSelector('[data-approve]');
    await page.screenshot({ path: path.join(outDir, '2-admin.png') });
    await page.click('[data-approve]');
    await page.waitForSelector('.chip.approved');

    console.log('9. AR view: trigger detected, both elements anchored');
    await page.goto(`http://localhost:${PORT}/portal/index.html?backend=local`);
    const testLink = await page.getAttribute('.row-actions a', 'href');
    await page.goto(`http://localhost:${PORT}/portal/${testLink.replace('./', '')}&backend=local`);
    await page.waitForFunction(() => window.__test.loaded || window.__test.error);
    await page.click('#startBtn');
    await page.waitForFunction(() => window.__test.started || window.__test.error, null, { timeout: 120000 });
    const err = await page.evaluate(() => window.__test.error);
    if (err) throw new Error('AR view failed: ' + err);
    await page.waitForFunction(() => window.__test.targetFound, null, { timeout: 180000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(outDir, '3-ar-elements.png') });
    console.log('   trigger detected, elements anchored');

    console.log('\nPORTAL FLOW PASSED: crop/rotate -> quality gate -> multi-element editor -> preview -> submit -> approve -> AR');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error('PORTAL TEST FAILED:', e); process.exit(1); });
