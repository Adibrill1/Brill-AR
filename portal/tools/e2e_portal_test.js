// Full artist-portal flow test, headless:
// profile -> weak image rejected by quality check -> good image passes -> video upload
// (format validation) -> soundtrack -> submit -> admin approve -> AR view detects the
// trigger image (fake camera) and plays the video content.
// Usage: node e2e_portal_test.js <repoRoot> <assetsDir> <outDir>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = process.argv[2] || path.resolve(__dirname, '..', '..');
const assetsDir = process.argv[3] || __dirname;   // flat.png + testvideo.webm live here
const outDir = process.argv[4] || path.join(__dirname, 'e2e-out');
const PORT = 8737;

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
    await page.goto(`http://localhost:${PORT}/portal/index.html`);
    await page.fill('#pName', 'Test Artist');
    await page.fill('#pCountry', 'Israel');
    await page.click('#saveProfileBtn');
    await page.waitForFunction(() => document.getElementById('profileNote').textContent.includes('✓'));

    console.log('2. weak image should be graded poor and blocked');
    await page.setInputFiles('#imgInput', path.join(assetsDir, 'flat.png'));
    await page.waitForSelector('#qualityBtn:not([disabled])');
    await page.click('#qualityBtn');
    await page.waitForFunction(() => window.__portal.qualityDone || window.__portal.error, null, { timeout: 300000 });
    let grade = await page.evaluate(() => window.__portal.lastGrade);
    console.log('   flat image grade:', grade);
    if (grade === 'good') throw new Error('flat image unexpectedly graded good — scoring broken');
    await page.screenshot({ path: path.join(outDir, '1-quality-poor.png') });

    console.log('3. rich image should pass');
    await page.setInputFiles('#imgInput', path.join(assetsDir, 'marker_hd.png'));
    await page.waitForSelector('#qualityBtn:not([disabled])');
    await page.evaluate(() => { window.__portal.qualityDone = false; });
    await page.click('#qualityBtn');
    await page.waitForFunction(() => window.__portal.qualityDone || window.__portal.error, null, { timeout: 300000 });
    grade = await page.evaluate(() => window.__portal.lastGrade);
    console.log('   marker grade:', grade);
    if (grade === 'poor') throw new Error('marker graded poor — scoring broken');
    await page.screenshot({ path: path.join(outDir, '2-quality-good.png') });

    console.log('4. video upload (webm) validates');
    await page.setInputFiles('#contentInput', path.join(assetsDir, 'testvideo.webm'));
    await page.waitForFunction(() => document.getElementById('contentInfo').textContent.includes('נטען בהצלחה'));
    console.log('  ', await page.evaluate(() => document.getElementById('contentInfo').textContent));

    console.log('5. soundtrack validates');
    await page.setInputFiles('#audioInput', path.join(repoRoot, 'spike', 'assets', 'soundtrack.wav'));
    await page.waitForFunction(() => document.getElementById('audioInfo').textContent.includes('נטען בהצלחה'));

    console.log('6. submit');
    await page.fill('#titleInput', 'יצירת בדיקה');
    await page.fill('#descInput', 'בדיקת זרימה מלאה');
    await page.check('#rightsCheck');
    await page.waitForSelector('#submitBtn:not([disabled])');
    await page.click('#submitBtn');
    await page.waitForFunction(() => window.__portal.submitted);
    await page.waitForSelector('.chip.pending');
    await page.screenshot({ path: path.join(outDir, '3-submitted.png') });

    console.log('7. admin approves');
    await page.goto(`http://localhost:${PORT}/portal/admin.html`);
    await page.waitForFunction(() => window.__admin.rendered || window.__admin.error);
    await page.waitForSelector('[data-approve]');
    await page.screenshot({ path: path.join(outDir, '4-admin.png') });
    await page.click('[data-approve]');
    await page.waitForSelector('.chip.approved');

    console.log('8. AR view: trigger detected, video content plays');
    await page.goto(`http://localhost:${PORT}/portal/index.html`);
    const testLink = await page.getAttribute('.row-actions a', 'href');
    await page.goto(`http://localhost:${PORT}/portal/${testLink.replace('./', '')}`);
    await page.waitForFunction(() => window.__test.loaded || window.__test.error);
    await page.click('#startBtn');
    await page.waitForFunction(() => window.__test.started || window.__test.error, null, { timeout: 120000 });
    const err = await page.evaluate(() => window.__test.error);
    if (err) throw new Error('AR view failed: ' + err);
    await page.waitForFunction(() => window.__test.targetFound, null, { timeout: 180000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(outDir, '5-ar-video.png') });
    console.log('   trigger detected, video anchored');

    console.log('\nPORTAL FLOW PASSED: profile -> quality gate -> video+audio upload -> submit -> approve -> AR');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error('PORTAL TEST FAILED:', e); process.exit(1); });
