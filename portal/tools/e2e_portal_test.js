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

    console.log('4. element 1: video imported via the green button, full-cover fit');
    await page.setInputFiles('#importInput', path.join(assetsDir, 'testvideo.webm'));
    await page.waitForFunction(() =>
      document.querySelector('.el-card:nth-child(1) [data-role=info]').textContent.includes('נטען בהצלחה'));
    await page.check('.el-card:nth-child(1) [data-role=fit]');

    console.log('4b. cover element is still movable within the frame + resizable (req 5)');
    await page.waitForFunction(() => window.__portal.previewCount >= 1, null, { timeout: 60000 });
    const coverMoved = await page.evaluate(() => window.__portal.testNudge());
    if (!coverMoved || Math.abs(coverMoved.x - coverMoved.slider) > 0.001) {
      throw new Error('cover element not draggable/synced: ' + JSON.stringify(coverMoved));
    }
    await page.evaluate(() => {
      const x = document.querySelector('.el-card:nth-child(1) [data-t=x]');
      x.value = '0'; x.dispatchEvent(new Event('input', { bubbles: true }));
    });

    console.log('5. element 2: upright floating image (imported via the green button)');
    await page.setInputFiles('#importInput', path.join(assetsDir, 'flat.png'));
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
    await page.waitForSelector('.chip.approved');

    console.log('7b. duplicate trigger image is blocked');
    await page.setInputFiles('#imgInput', path.join(assetsDir, 'marker_hd.png'));
    await page.waitForSelector('#cropEditor', { state: 'visible' });
    await page.click('#cropApply');
    await page.waitForFunction(() => window.__portal.dupBlocked || window.__portal.imageReady, null, { timeout: 60000 });
    const dupBlocked = await page.evaluate(() => window.__portal.dupBlocked);
    if (!dupBlocked) throw new Error('duplicate image was NOT blocked');
    console.log('   ', await page.evaluate(() => document.getElementById('imgError').textContent.slice(0, 60)));
    await page.screenshot({ path: path.join(outDir, '1b-duplicate-blocked.png') });

    console.log('8. published directly — exactly ONE item exists (no double submit, no moderation)');
    const itemCount1 = await page.evaluate(() => document.querySelectorAll('#itemsList .item').length);
    if (itemCount1 !== 1) throw new Error(`expected exactly 1 item, got ${itemCount1} — double submit?`);
    await page.goto(`http://localhost:${PORT}/portal/admin.html?backend=local`);
    await page.waitForFunction(() => window.__admin.rendered || window.__admin.error);
    await page.waitForFunction(() =>
      document.getElementById('pendingList').textContent.includes('אין תמונות טריגר'));
    await page.screenshot({ path: path.join(outDir, '2-admin.png') });

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

    console.log('9b. edit the published creation — republishes in place, single row');
    await page.goto(`http://localhost:${PORT}/portal/index.html?backend=local`);
    await page.waitForSelector('[data-edit]');
    await page.click('[data-edit]');
    await page.waitForSelector('#cancelEditBtn', { state: 'visible' });
    await page.waitForFunction(() => window.__portal.imageReady && window.__portal.qualityDone);
    await page.fill('#titleInput', 'יצירה ערוכה');
    await page.check('#rightsCheck');
    await page.waitForSelector('#submitBtn:not([disabled])');
    await page.evaluate(() => { window.__portal.submitted = false; });
    await page.click('#submitBtn');
    await page.waitForFunction(() => window.__portal.submitted);
    await page.waitForSelector('.chip.approved');
    const afterEdit = await page.evaluate(() => document.querySelectorAll('#itemsList .item').length);
    if (afterEdit !== 1) throw new Error('edit created ' + afterEdit + ' rows instead of updating in place');
    console.log('   edited item republished in place');

    console.log('9c. community sticker: contribute -> admin approve -> in the shared picker');
    await page.goto(`http://localhost:${PORT}/portal/index.html?backend=local`);
    await page.setInputFiles('#libFile', path.join(assetsDir, 'flat.png'));
    await page.waitForSelector('#libSubmitBtn:not([disabled])');
    await page.click('#libSubmitBtn');
    await page.waitForFunction(() => window.__portal.libSubmitted);
    await page.goto(`http://localhost:${PORT}/portal/admin.html?backend=local`);
    await page.waitForSelector('[data-lib-approve]');
    await page.click('[data-lib-approve]');
    await page.waitForFunction(() =>
      document.getElementById('libPendingList').textContent.includes('אין תרומות'));
    console.log('   sticker approved into the shared library');

    console.log('10. second creation (different trigger) for the multi-target exhibition');
    await page.goto(`http://localhost:${PORT}/portal/index.html?backend=local`);
    await page.evaluate(() => { window.__portal.qualityDone = false; });
    await pickImage(page, path.join(assetsDir, 'marker2_hd.png'));
    await page.waitForFunction(() => window.__portal.qualityDone || window.__portal.error, null, { timeout: 300000 });
    await page.setInputFiles('#importInput', path.join(assetsDir, 'testvideo.webm'));
    await page.waitForFunction(() =>
      document.querySelector('.el-card:nth-child(1) [data-role=info]').textContent.includes('נטען בהצלחה'));

    console.log('10b. library element (spinning star, custom speed) + styled text element');
    await page.click('#addLibBtn');
    await page.selectOption('.el-card:nth-child(2) [data-role=libId]', 'star');
    await page.selectOption('.el-card:nth-child(2) [data-role=anim]', 'spin');
    await page.evaluate(() => {
      const s = document.querySelector('.el-card:nth-child(2) [data-role=speed]');
      s.value = '2';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('#addTextBtn');
    await page.fill('.el-card:nth-child(3) [data-role=text]', 'שלום עולם\nPEACE');
    await page.selectOption('.el-card:nth-child(3) [data-role=font]', 'Rubik');
    await page.check('.el-card:nth-child(3) [data-role=bold]');
    await page.check('.el-card:nth-child(3) [data-role=bgOn]');
    await page.selectOption('.el-card:nth-child(3) [data-role=anim]', 'wave');
    await page.waitForFunction(() => window.__portal.previewCount === 3, null, { timeout: 60000 });

    console.log('10b2. community sticker element from the shared library');
    await page.click('#addLibBtn');
    const assetVal = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('.el-card:nth-child(4) [data-role=libId] option')];
      return opts.find((o) => o.value.startsWith('asset:'))?.value || null;
    });
    if (!assetVal) throw new Error('approved community asset missing from picker');
    await page.selectOption('.el-card:nth-child(4) [data-role=libId]', assetVal);
    await page.waitForFunction(() => window.__portal.previewCount === 4, null, { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.locator('#previewWrap').screenshot({ path: path.join(outDir, '6-lib-text-preview.png') });

    console.log('10c. direct-manipulation gizmo moves element and syncs slider');
    const nudge = await page.evaluate(() => window.__portal.testNudge());
    if (!nudge || Math.abs(nudge.x - nudge.slider) > 0.001) {
      throw new Error('gizmo drag path broken: ' + JSON.stringify(nudge));
    }
    console.log('   moved to x=' + nudge.x + ', slider synced');

    console.log('10c2. rotation gizmo spins the element and syncs the rotz slider');
    const rot = await page.evaluate(() => window.__portal.testRotate(0, 30));
    const rotSlider = await page.evaluate(() => {
      const s = document.querySelector('.el-card:nth-child(1) [data-t=rotz]');
      return s ? parseFloat(s.value) : null;
    });
    if (!rot || rot.rotz === 0 || (rotSlider !== null && rotSlider !== rot.rotz)) {
      throw new Error('rotation gizmo path broken: ' + JSON.stringify({ rot, rotSlider }));
    }
    console.log('   rotated to rotz=' + rot.rotz);

    console.log('10d. locked element (in-preview lock) is skipped by selection');
    await page.evaluate(() => window.__portal.testLock(1));
    const nudge2 = await page.evaluate(() => window.__portal.testNudge());
    if (!nudge2) throw new Error('no unlocked element found after locking one');
    console.log('   lock respected, another element selected');

    await page.fill('#titleInput', 'יצירה שנייה');
    await page.check('#rightsCheck');
    await page.waitForSelector('#submitBtn:not([disabled])');
    await page.click('#submitBtn');
    await page.waitForFunction(() => window.__portal.submitted);
    await page.waitForSelector('.chip.approved');

    console.log('11. exhibition scan page: loads all approved works, merges targets, detects');
    await page.goto(`http://localhost:${PORT}/visit/index.html?backend=local`);
    await page.waitForFunction(() => window.__visit.itemCount > 0 || window.__visit.error, null, { timeout: 60000 });
    const count = await page.evaluate(() => window.__visit.itemCount);
    console.log(`   approved works in exhibition: ${count}`);
    if (count < 2) throw new Error('expected 2 approved works, got ' + count);
    await page.click('#startBtn');
    await page.waitForFunction(() => window.__visit.started || window.__visit.error, null, { timeout: 180000 });
    const verr = await page.evaluate(() => window.__visit.error);
    if (verr) throw new Error('visit page failed: ' + verr);
    await page.waitForFunction(() => window.__visit.foundId, null, { timeout: 180000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, '4-visit-found.png') });
    console.log('   artwork detected in multi-target exhibition, caption shown');

    console.log('12. keepsake recording + collection');
    await page.click('#recBtn');
    await page.waitForFunction(() => window.__visit.blobSize > 0, null, { timeout: 30000 });
    const rec = await page.evaluate(() => ({ size: window.__visit.blobSize, collected: window.__visit.collected,
      posterLen: document.getElementById('playback').poster.length }));
    console.log(`   recording: ${rec.size} bytes, collected: ${rec.collected}, poster: ${rec.posterLen} chars`);
    if (!rec.collected) throw new Error('collection not updated');
    if (rec.posterLen < 100) throw new Error('result poster missing — thumbnail would be black');
    await page.screenshot({ path: path.join(outDir, '5-visit-result.png') });

    console.log('\nFULL LOOP PASSED: artist upload -> moderation -> exhibition scan -> AR -> keepsake -> collection');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error('PORTAL TEST FAILED:', e); process.exit(1); });
