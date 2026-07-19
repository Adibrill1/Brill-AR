# Brill-AR — Design Export

מסמך מרוכז של כל קבצי העיצוב הרלוונטיים באפליקציית Brill-AR, לצורך עבודה עם כלי עיצוב חיצוני.
נוצר מהבראנץ' `claude/file-review-recommendations-itd5ce`.

**מפת צבעים (CSS custom properties, מוגדרת ב-`style.css`):**
- `--deep: #1f4e5f` — כחול-ירוק כהה (רקע header, כותרות)
- `--mid: #2e6e85` — כחול-ירוק בינוני (טקסט משני, מסגרות)
- `--gold: #d4ac0d` — זהב (פעולה ראשית, מותגים)
- `--paper: #f5f0e8` — קרם (רקע העמוד)
- `--ok: #27ae60` — ירוק (הצלחה, כפתור ייבוא)
- `--warn: #e67e22` — כתום (אזהרה)
- `--bad: #c0392b` — אדום (שגיאה/מחיקה)
- `--ink: #1f2733` — כמעט-שחור (טקסט ראשי)

**פונטים:** Rubik, Heebo, Frank Ruhl Libre, Secular One, Amatic SC (כולם עברית+לטינית, קבצי woff/woff2 מקומיים).

**עמודים:**
1. `portal/index.html` — פורטל היוצרים (העמוד המרכזי)
2. `portal/admin.html` — פאנל ניהול/אישור
3. `visit/index.html` — חוויית המבקר/AR (עיצוב כהה, עצמאי — לא תלוי ב-style.css)

---

## 1. portal/style.css (הגיליון המשותף ל-index.html ו-admin.html)

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --deep: #1f4e5f; --mid: #2e6e85; --gold: #d4ac0d; --paper: #f5f0e8;
  --ok: #27ae60; --warn: #e67e22; --bad: #c0392b; --ink: #1f2733;
}
body { font-family: system-ui, sans-serif; background: var(--paper); color: var(--ink); min-height: 100vh; }
header { background: var(--deep); color: var(--paper); padding: 18px 20px; }
header h1 { font-size: 1.3rem; }
header .sub { color: #cfe2ea; font-size: .9rem; margin-top: 4px; }
.header-row { display: flex; align-items: center; justify-content: space-between; gap: 14px;
  max-width: 720px; margin: 0 auto; }
.profile-btn { margin: 0; background: rgba(255,255,255,.14); color: var(--paper);
  border: 1.5px solid rgba(255,255,255,.4); padding: 9px 16px; font-size: .9rem;
  border-radius: 22px; white-space: nowrap; }
.profile-btn:hover { background: rgba(255,255,255,.24); }

/* profile side drawer */
.drawer-backdrop { position: fixed; inset: 0; background: rgba(15,30,36,.5); z-index: 40; }
.drawer-backdrop[hidden] { display: none; }
.drawer { position: fixed; top: 0; left: 0; height: 100%; width: min(360px, 88vw);
  background: #fff; z-index: 50; padding: 20px; box-shadow: 4px 0 20px rgba(31,78,95,.2);
  transform: translateX(-100%); transition: transform .25s ease; overflow-y: auto; }
.drawer.open { transform: none; }
.drawer-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.drawer-head h2 { color: var(--deep); font-size: 1.1rem; }
.drawer-close { margin: 0; background: transparent; color: var(--mid); font-size: 1.2rem;
  padding: 4px 10px; border-radius: 10px; }
.demo-banner { background: var(--gold); color: var(--ink); padding: 8px 20px; font-size: .85rem; }
main { max-width: 720px; margin: 0 auto; padding: 20px 16px 60px; }
section.card { background: #fff; border-radius: 14px; padding: 20px; margin-top: 18px;
               box-shadow: 0 2px 10px rgba(31,78,95,.08); }
section.card h2 { color: var(--deep); font-size: 1.1rem; margin-bottom: 14px; }
label { display: block; font-weight: 600; margin: 12px 0 4px; font-size: .95rem; }
.hint { font-weight: 400; color: #667; font-size: .82rem; margin-top: 2px; }
input[type=text], textarea, select {
  width: 100%; padding: 10px 12px; border: 1.5px solid #ccd4d8; border-radius: 10px;
  font: inherit; background: #fbfaf7;
}
input[type=file] { width: 100%; padding: 8px 0; font-size: .9rem; }
textarea { min-height: 70px; resize: vertical; }
button, .btn {
  font: inherit; font-weight: 700; border: 0; border-radius: 24px; cursor: pointer;
  padding: 11px 24px; background: var(--gold); color: var(--ink); margin-top: 14px;
  text-decoration: none; display: inline-block;
}
button.secondary, .btn.secondary { background: transparent; border: 2px solid var(--mid); color: var(--mid); }
button.danger { background: transparent; border: 2px solid var(--bad); color: var(--bad); }
button:disabled { opacity: .45; cursor: not-allowed; }
.field-error { color: var(--bad); font-size: .85rem; margin-top: 4px; }
.quality { border-radius: 10px; padding: 12px 14px; margin-top: 10px; font-size: .92rem; }
.quality.good { background: #e8f7ee; border: 1.5px solid var(--ok); }
.quality.medium { background: #fdf2e4; border: 1.5px solid var(--warn); }
.quality.poor { background: #fbe9e7; border: 1.5px solid var(--bad); }
.quality ul { margin: 8px 18px 0; }
.bar { height: 8px; border-radius: 4px; background: #e2e2e2; margin-top: 8px; overflow: hidden; }
.bar > div { height: 100%; border-radius: 4px; }
.preview-media { max-width: 100%; max-height: 220px; border-radius: 10px; margin-top: 10px; display: block; }
.item { display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid #eee; }
.item:last-child { border-bottom: 0; }
.item img { width: 74px; height: 104px; object-fit: cover; border-radius: 8px; }
.item .meta { flex: 1; }
.item .meta h3 { font-size: 1rem; }
.item .meta .small { color: #667; font-size: .82rem; margin-top: 3px; }
.chip { display: inline-block; padding: 3px 12px; border-radius: 14px; font-size: .78rem;
        font-weight: 700; margin-top: 6px; }
.chip.pending { background: #fdf2e4; color: var(--warn); }
.chip.approved { background: #e8f7ee; color: var(--ok); }
.chip.rejected { background: #fbe9e7; color: var(--bad); }
.row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.row-actions .btn, .row-actions button { margin-top: 8px; padding: 8px 16px; font-size: .85rem; }
.progress-note { font-size: .85rem; color: var(--mid); margin-top: 8px; }
.empty { color: #778; text-align: center; padding: 24px 0; }

/* crop editor */
#cropCanvas { display: block; margin-top: 10px; border-radius: 10px; touch-action: none;
              max-width: 100%; cursor: crosshair; }
.crop-tools { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

/* element cards */
.el-card { border: 1.5px solid #ccd4d8; border-radius: 12px; padding: 14px; margin-top: 12px; background: #fbfaf7; }
.el-head { display: flex; gap: 10px; align-items: center; }
.el-head select { flex: 0 1 auto; width: auto; }
.el-head .el-del { margin-top: 0; margin-inline-start: auto; padding: 6px 14px; font-size: .82rem; }
.fit-row { font-weight: 400; display: flex; gap: 8px; align-items: center; margin-top: 10px; }
.transform { margin-top: 6px; }
.sl { font-weight: 400; font-size: .88rem; margin: 8px 0 2px; }
.sl output { color: var(--mid); font-weight: 700; margin-inline-start: 6px; }
.sl input[type=range] { width: 100%; accent-color: var(--gold); }

/* add-element area: one big green import button + format note + shortcut buttons */
.add-el { margin-top: 14px; }
.import-btn { display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--ok); color: #fff; font-weight: 800; font-size: 1.05rem;
  padding: 16px 24px; border-radius: 14px; cursor: pointer; text-align: center;
  box-shadow: 0 2px 8px rgba(39,174,96,.28); margin: 0; transition: filter .15s; }
.import-btn:hover { filter: brightness(1.06); }
.formats-note { color: #667; font-size: .82rem; margin-top: 8px; line-height: 1.6; text-align: center; }
.add-shortcuts { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.add-shortcuts .shortcut { flex: 1; margin-top: 0; text-align: center; }
.el-kind { font-weight: 700; color: var(--mid); font-size: .9rem; }

/* 3D preview */
#previewWrap { position: relative; margin-top: 8px; border-radius: 12px; overflow: hidden;
  background: #20313a; min-height: 60px; }
#previewWrap canvas { display: block; width: 100%; touch-action: none; }
/* per-element lock overlay, positioned over the canvas */
.pv-lock-layer { position: absolute; inset: 0; pointer-events: none; }
.pv-lock { position: absolute; transform: translate(-50%, -50%); pointer-events: auto;
  display: none; align-items: center; justify-content: center; width: 30px; height: 30px;
  padding: 0; margin: 0; border-radius: 50%; font-size: .95rem; line-height: 1;
  background: rgba(255,255,255,.92); border: 1.5px solid rgba(31,78,95,.35);
  box-shadow: 0 1px 4px rgba(0,0,0,.3); cursor: pointer; }
.pv-lock.locked { background: var(--gold); border-color: var(--gold); }

/* slider reset */
.sl-row { display: flex; align-items: flex-end; gap: 8px; }
.sl-row .sl { flex: 1; }
.sl-reset { margin: 0 0 4px; padding: 4px 10px; font-size: 1rem; border-radius: 8px;
            background: transparent; border: 1.5px solid #ccd4d8; color: var(--mid); cursor: pointer; }
#missingList { margin-top: 10px; line-height: 1.7; }

/* text element styling controls */
.text-style { display: flex; flex-wrap: wrap; gap: 4px 18px; align-items: center; }
.text-style label { margin: 8px 0 0; }
input[type=color] { border: 1.5px solid #ccd4d8; border-radius: 8px; width: 52px; height: 32px;
                    padding: 2px; background: #fbfaf7; vertical-align: middle; }

/* element fold + lock */
.el-fold { border: 0; background: transparent; font-size: 1rem; cursor: pointer; color: var(--mid); padding: 2px 6px; margin: 0; }
.el-lock { border: 0; background: transparent; font-size: 1rem; cursor: pointer; padding: 2px 6px; margin: 0; }
.el-summary { font-weight: 400; color: #667; font-size: .85rem; }
```

---

## 2. portal/index.html — מבנה HTML (ללא לוגיקת ה-JS)

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>פורטל יוצרים - Brill-AR</title>
<link rel="stylesheet" href="./style.css">
<link rel="stylesheet" href="./fonts/fonts.css">
</head>
<body>
<header>
  <div class="header-row">
    <div>
      <h1>פורטל יוצרים - Brill-AR</h1>
      <div class="sub">Brill-AR — Artist Portal</div>
    </div>
    <button id="profileToggle" class="profile-btn" type="button">☰ הפרופיל שלי</button>
  </div>
</header>
<div class="demo-banner" id="modeBanner">מצב הדגמה — הנתונים נשמרים בדפדפן זה בלבד</div>

<div class="drawer-backdrop" id="profileBackdrop" hidden></div>
<aside class="drawer" id="profileDrawer" aria-hidden="true">
  <div class="drawer-head">
    <h2>הפרופיל שלי / My profile</h2>
    <button class="drawer-close" id="profileClose" type="button" title="סגירה">✕</button>
  </div>
  <label>שם / Name <input type="text" id="pName"></label>
  <label>מדינה / Country <input type="text" id="pCountry"></label>
  <label>קצת עליי / Bio <textarea id="pBio"></textarea></label>
  <button id="saveProfileBtn">שמירת פרופיל</button>
  <span class="progress-note" id="profileNote"></span>
</aside>

<main>

<section class="card">
  <h2>יצירה חדשה / New trigger image</h2>

  <label>1. תמונת הטריגר
    <input type="file" id="imgInput" accept="image/*">
  </label>

  <div id="cropEditor" style="display:none">
    <div class="crop-tools">
      <button type="button" class="secondary" id="rotateBtn">סיבוב 90° ↻</button>
      <span class="hint">גררו פינות לחיתוך, מרכז להזזה</span>
    </div>
    <canvas id="cropCanvas"></canvas>
    <button type="button" id="cropApply">אישור התמונה</button>
  </div>

  <img id="imgPreview" class="preview-media" style="display:none">
  <div class="field-error" id="imgError"></div>
  <div class="quality medium" id="resWarn" style="display:none"></div>
  <div class="progress-note" id="qualityProgress"></div>
  <div id="qualityResult"></div>

  <label style="margin-top:22px">2. אלמנטים ביצירה</label>
  <div id="elementsList"></div>
  <div class="add-el">
    <label class="import-btn" id="importBtnLabel">⬆ ייבוא אלמנט
      <input type="file" id="importInput"
             accept="image/*,video/*,audio/*,.glb,.gltf,.mp4,.mov,.webm,.m4v,.ogv,.mp3,.wav" multiple hidden>
    </label>
    <div class="formats-note">תמונות · וידאו · שמע · תלת-מימד</div>
    <div class="add-shortcuts">
      <button type="button" class="secondary shortcut" id="addTextBtn">➤ טקסט</button>
      <button type="button" class="secondary shortcut" id="addLibBtn">➤ ספריית תלת-מימד</button>
    </div>
  </div>

  <label style="margin-top:22px">תצוגה מקדימה — העריכה כולה כאן
    <span class="hint">הקישו על אלמנט לבחירה; גררו להזזה, טבעות לסיבוב, כדור לגודל. לחיצה כפולה מוחקת.</span>
  </label>
  <div id="previewWrap"><div class="empty" id="previewEmpty">בחרו תמונת טריגר ואלמנט אחד לפחות</div></div>

  <label style="margin-top:22px">3. פס קול (אופציונלי, עד 30 שניות)
    <input type="file" id="audioInput" accept="audio/*,.mp3,.wav">
  </label>
  <div class="field-error" id="audioError"></div>
  <div class="progress-note" id="audioInfo"></div>

  <label>4. שם היצירה <input type="text" id="titleInput"></label>
  <label>תיאור קצר <textarea id="descInput"></textarea></label>

  <label style="font-weight:400; display:flex; gap:8px; align-items:flex-start;">
    <input type="checkbox" id="rightsCheck" style="margin-top:3px">
    <span>אני מצהיר/ה שהיצירה, האלמנטים ופס הקול הם ביצירתי או ברישיון המתיר לי להשתמש בהם.</span>
  </label>

  <button id="submitBtn" disabled>פרסום היצירה</button>
  <button id="cancelEditBtn" class="secondary" type="button" style="display:none">ביטול עריכה</button>
  <div class="hint" id="missingList"></div>
  <div class="field-error" id="submitError"></div>
</section>

<section class="card">
  <h2>הספרייה המשותפת — תרומת אלמנטים / Shared library</h2>
  <p class="hint">אלמנטים (GLB) או מדבקות (PNG/JPG/WebP) לשיתוף כל היוצרים — כל תרומה עוברת אישור.</p>
  <label>קבצים <input type="file" id="libFile" accept=".glb,image/png,image/jpeg,image/webp" multiple></label>
  <div id="libUploadList"></div>
  <button id="libSubmitBtn" disabled>שליחת התרומות לאישור</button>
  <div class="progress-note" id="libNote"></div>
  <div id="myLibList"></div>
</section>

<section class="card">
  <h2>היצירות שלי / My trigger images</h2>
  <div id="itemsList"><div class="empty">עוד אין יצירות — ההעלאה הראשונה שלך תופיע כאן</div></div>
</section>

</main>
```

---

## 3. portal/admin.html — מבנה HTML מלא (ללא לוגיקת ה-JS)

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>פאנל אדמין — שלום וטכנולוגיה</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<header>
  <h1>פאנל אדמין — אישור תמונות טריגר</h1>
  <div class="sub">Peace &amp; Technology — Moderation</div>
</header>
<div class="demo-banner" id="modeBanner">מצב הדגמה: מציג נתונים מהדפדפן הזה בלבד (חיבור לשרת — בשלב הבא)</div>
<main>
<section class="card">
  <h2>ממתינים לאישור</h2>
  <div id="pendingList"></div>
</section>
<section class="card">
  <h2>תרומות לספרייה המשותפת</h2>
  <div id="libPendingList"></div>
</section>
<section class="card">
  <h2>כל תמונות הטריגר</h2>
  <div id="allList"></div>
</section>
</main>
```

---

## 4. visit/index.html — מבנה + עיצוב מוטבע (חוויית מבקר, עיצוב כהה עצמאי)

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>שלום וטכנולוגיה — סיור בתערוכה</title>
<link rel="stylesheet" href="../portal/fonts/fonts.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; font-family: system-ui, sans-serif; background: #111; color: #eee; }
  #container { position: fixed; inset: 0; overflow: hidden; }
  .overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center;
             justify-content: center; gap: 14px; background: #1f4e5f; z-index: 20; text-align: center;
             padding: 24px; overflow-y: auto; }
  .overlay h1 { font-size: 1.7rem; }
  .overlay .en { color: #9fc3d0; font-size: 1rem; }
  .overlay p { color: #cfe2ea; max-width: 420px; line-height: 1.6; }
  button, .btn { font-size: 1.05rem; padding: 13px 26px; border: 0; border-radius: 28px; background: #d4ac0d;
           color: #1f2733; font-weight: 700; cursor: pointer; text-decoration: none; }
  button.secondary, .btn.secondary { background: transparent; color: #d4ac0d; border: 2px solid #d4ac0d; }
  #hud { position: fixed; bottom: 0; left: 0; right: 0; z-index: 10; display: none;
         flex-direction: column; align-items: center; gap: 8px; padding: 18px;
         background: linear-gradient(transparent, rgba(0,0,0,.6)); }
  #caption { display: none; background: rgba(31,78,95,.85); padding: 8px 18px; border-radius: 14px;
             text-align: center; max-width: 92vw; }
  #caption .t { font-weight: 700; }
  #caption .a { font-size: .85rem; color: #cfe2ea; }
  #status { font-size: .95rem; background: rgba(0,0,0,.5); padding: 6px 14px; border-radius: 16px; }
  #recBtn { background: #c0392b; color: #fff; border-radius: 50%; width: 72px; height: 72px;
            font-size: .8rem; display: none; }
  #recBtn.recording { animation: pulse 1s infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); } }
  #result { position: fixed; inset: 0; z-index: 30; background: rgba(10,14,18,.96); display: none;
            flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 20px; }
  #result video { max-width: 90vw; max-height: 55vh; border-radius: 12px; border: 2px solid #d4ac0d; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  #collectionOverlay { display: none; }
  .col-item { display: flex; gap: 12px; align-items: center; background: rgba(255,255,255,.07);
              border-radius: 12px; padding: 10px 14px; width: min(420px, 88vw); text-align: right; }
  .col-item img { width: 52px; height: 72px; object-fit: cover; border-radius: 8px; }
  .col-item .t { font-weight: 700; }
  .col-item .a { font-size: .85rem; color: #cfe2ea; }
  #loadNote { font-size: .9rem; color: #9fc3d0; }
  .hint-small { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 10;
                font-size: .8rem; color: #cfe2ea; background: rgba(0,0,0,.4); padding: 4px 12px;
                border-radius: 12px; display: none; }
</style>
</head>
<body>
<div class="overlay" id="startOverlay">
  <h1>ברוכים הבאים לתערוכת מציאות רבודה מבית Brill-AR</h1>
  <div id="loadNote">טוען את התערוכה…</div>
  <button id="startBtn" disabled>התחלת סיור / Start</button>
  <button class="secondary" id="collectionBtn">האוסף שלי / My collection (<span id="colCount">0</span>)</button>
</div>

<div class="overlay" id="collectionOverlay">
  <h1>האוסף שלי</h1>
  <p>היצירות שפגשת בתערוכה</p>
  <div id="collectionList"></div>
  <button class="secondary" id="colBack">חזרה</button>
</div>

<div id="container"></div>
<div class="hint-small" id="scanHint">חפשו יצירה וכוונו אליה את המצלמה</div>

<div id="hud">
  <div id="caption"><div class="t"></div><div class="a"></div></div>
  <div id="status">מחפש יצירה…</div>
  <button id="recBtn">REC</button>
</div>

<div id="result">
  <h2>המזכרת שלך / Your keepsake</h2>
  <video id="playback" controls playsinline></video>
  <div class="row">
    <a class="btn" id="saveBtn" style="display:none">שמירה לגלריה / Save to gallery</a>
    <a class="btn secondary" id="downloadBtn" download>הורדה / Download</a>
    <a class="btn secondary" id="againBtn">המשך סיור / Continue</a>
  </div>
  <p id="saveHint" style="display:none; color:#cfe2ea; font-size:.85rem; max-width:320px; text-align:center;">
    בתפריט שייפתח בחרו "שמור וידאו" / In the menu that opens, tap "Save Video"</p>
</div>
```

---

## 5. portal/fonts/fonts.css (הגדרות הפונטים)

```css
/* rubik-hebrew-400-normal */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/rubik-hebrew-400-normal.woff2) format('woff2'), url(./files/rubik-hebrew-400-normal.woff) format('woff');
}/* rubik-latin-400-normal */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/rubik-latin-400-normal.woff2) format('woff2'), url(./files/rubik-latin-400-normal.woff) format('woff');
}/* rubik-hebrew-700-normal */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/rubik-hebrew-700-normal.woff2) format('woff2'), url(./files/rubik-hebrew-700-normal.woff) format('woff');
}/* rubik-latin-700-normal */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/rubik-latin-700-normal.woff2) format('woff2'), url(./files/rubik-latin-700-normal.woff) format('woff');
}/* heebo-hebrew-400-normal */
@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/heebo-hebrew-400-normal.woff2) format('woff2'), url(./files/heebo-hebrew-400-normal.woff) format('woff');
}/* heebo-latin-400-normal */
@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/heebo-latin-400-normal.woff2) format('woff2'), url(./files/heebo-latin-400-normal.woff) format('woff');
}/* heebo-hebrew-700-normal */
@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/heebo-hebrew-700-normal.woff2) format('woff2'), url(./files/heebo-hebrew-700-normal.woff) format('woff');
}/* heebo-latin-700-normal */
@font-face {
  font-family: 'Heebo';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/heebo-latin-700-normal.woff2) format('woff2'), url(./files/heebo-latin-700-normal.woff) format('woff');
}/* frank-ruhl-libre-hebrew-400-normal */
@font-face {
  font-family: 'Frank Ruhl Libre';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/frank-ruhl-libre-hebrew-400-normal.woff2) format('woff2'), url(./files/frank-ruhl-libre-hebrew-400-normal.woff) format('woff');
}/* frank-ruhl-libre-latin-400-normal */
@font-face {
  font-family: 'Frank Ruhl Libre';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/frank-ruhl-libre-latin-400-normal.woff2) format('woff2'), url(./files/frank-ruhl-libre-latin-400-normal.woff) format('woff');
}/* frank-ruhl-libre-hebrew-700-normal */
@font-face {
  font-family: 'Frank Ruhl Libre';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/frank-ruhl-libre-hebrew-700-normal.woff2) format('woff2'), url(./files/frank-ruhl-libre-hebrew-700-normal.woff) format('woff');
}/* frank-ruhl-libre-latin-700-normal */
@font-face {
  font-family: 'Frank Ruhl Libre';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/frank-ruhl-libre-latin-700-normal.woff2) format('woff2'), url(./files/frank-ruhl-libre-latin-700-normal.woff) format('woff');
}/* secular-one-hebrew-400-normal */
@font-face {
  font-family: 'Secular One';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/secular-one-hebrew-400-normal.woff2) format('woff2'), url(./files/secular-one-hebrew-400-normal.woff) format('woff');
}/* secular-one-latin-400-normal */
@font-face {
  font-family: 'Secular One';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/secular-one-latin-400-normal.woff2) format('woff2'), url(./files/secular-one-latin-400-normal.woff) format('woff');
}/* amatic-sc-hebrew-400-normal */
@font-face {
  font-family: 'Amatic SC';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/amatic-sc-hebrew-400-normal.woff2) format('woff2'), url(./files/amatic-sc-hebrew-400-normal.woff) format('woff');
}/* amatic-sc-latin-400-normal */
@font-face {
  font-family: 'Amatic SC';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/amatic-sc-latin-400-normal.woff2) format('woff2'), url(./files/amatic-sc-latin-400-normal.woff) format('woff');
}/* amatic-sc-hebrew-700-normal */
@font-face {
  font-family: 'Amatic SC';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/amatic-sc-hebrew-700-normal.woff2) format('woff2'), url(./files/amatic-sc-hebrew-700-normal.woff) format('woff');
}/* amatic-sc-latin-700-normal */
@font-face {
  font-family: 'Amatic SC';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/amatic-sc-latin-700-normal.woff2) format('woff2'), url(./files/amatic-sc-latin-700-normal.woff) format('woff');
}
```
