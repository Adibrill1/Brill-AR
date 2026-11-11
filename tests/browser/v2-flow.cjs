const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');const server=require('../../server/server');
// The new studio, start to finish, on a phone and on a computer: the empty gallery, a new creation, uploading the
// artwork through the real file picker, adding layers from the "add" sheet, editing in the inspector, undo/redo,
// renaming, and the gallery card with its menu (rename, duplicate, delete with a question). Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
for(const phone of [true,false]){
  const ctx=await b.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
  const p=await ctx.newPage(),errs=[],tag=phone?'phone':'computer';p.on('pageerror',e=>errs.push(String(e)));
  const stored=()=>p.evaluate(()=>Studio.load(App.rec.id));
  const rows=()=>p.locator('.layer-row').count();
  const add=async(name)=>{await p.locator('#btn-add').click();await p.locator('.add-tile',{hasText:name}).click();await p.waitForTimeout(900);};
  const showLayers=async()=>{if(phone){await p.locator('.tab[data-tab="layers"]').click();await p.waitForTimeout(200);}};

  await p.goto(base+'/index.html');await p.waitForSelector('#home-empty:not([hidden])');
  assert.equal(await p.locator('#home-grid').isVisible(),false,tag+': no grid while empty');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,tag+': the gallery does not scroll sideways');
  await p.locator('#btn-new-empty').click();await p.waitForSelector('#editor:not([hidden])');
  assert.match(await p.evaluate(()=>location.hash),/^#\/e\//,tag+': the creation has its own address');
  assert.ok(await p.locator('#stage-empty').isVisible(),tag+': asks for the artwork first');

  // adding before there is artwork is refused with a hint
  await p.locator('#btn-add').click();await p.waitForTimeout(300);
  assert.equal(await p.locator('dialog[open]').count(),0,tag+': no add sheet without artwork');
  // the artwork goes through the real file picker
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#btn-empty-art').click()]);
  await fc.setFiles(path.join(__dirname,'../fixtures/target-a.png'));
  await p.waitForFunction(()=>App.rec&&App.rec.target,null,{timeout:30000});await p.waitForTimeout(600);
  assert.equal(await p.locator('#stage-empty').isVisible(),false,tag+': the stage shows the artwork');
  assert.ok((await stored()).assets.__artwork,tag+': artwork saved');
  const cv=await p.locator('#preview').boundingBox(),st=await p.locator('#stage').boundingBox();
  assert.ok(cv.width>100&&cv.height>100&&cv.width<=st.width+1&&cv.height<=st.height+1,tag+': canvas fills the stage and stays inside it');

  // text: added, selected, the inspector opens on it, typing reaches storage
  await add('טקסט');
  assert.equal(await rows(),1,tag+': one layer');assert.equal(await p.locator('.layer-row.on').count(),1,tag+': and it is selected');
  if(phone)assert.equal(await p.evaluate(()=>document.body.dataset.pane),'inspector',tag+': the phone moves to the settings');
  await p.locator('#in-text').fill('מזל טוב');await p.waitForTimeout(900);
  assert.equal((await stored()).elements[0].text,'מזל טוב',tag+': text saved');
  for(const t of ['style','place','motion','tap']){await p.locator('.tab[data-tab="'+t+'"]').click();await p.waitForTimeout(150);assert.ok(await p.locator('#inspector .group').count()>0,tag+': tab '+t+' has controls');}
  // a slider writes through
  await p.locator('.tab[data-tab="place"]').click();
  const num=p.locator('#inspector .num').first();await num.fill('20');await num.press('Enter');await p.waitForTimeout(700);
  assert.ok(Math.abs((await stored()).elements[0].x-0.2)<0.011,tag+': the position box moves the layer');

  await showLayers();await add('חלקיקים');await showLayers();await add('רקע מונפש');
  assert.equal(await rows(),3,tag+': three layers');
  assert.deepEqual((await stored()).elements.map(e=>e.type).sort(),['particles','pattern','text'],tag+': the three kinds are saved');
  assert.equal((await p.locator('#layer-count').textContent()).trim(),'3',tag+': the count follows');

  // undo and redo
  await p.locator('#btn-undo').click();await p.waitForTimeout(700);assert.equal(await rows(),2,tag+': undo removes the last layer');
  await p.locator('#btn-redo').click();await p.waitForTimeout(700);assert.equal(await rows(),3,tag+': redo brings it back');
  // the row menu: duplicate and delete
  await showLayers();await p.locator('.layer-row .row-more').first().click();await p.locator('.menu-item',{hasText:'שכפול'}).click();await p.waitForTimeout(800);
  assert.equal(await rows(),4,tag+': duplicated');
  await showLayers();await p.locator('.layer-row .row-more').first().click();await p.locator('.menu-item.danger').click();await p.waitForTimeout(800);
  assert.equal(await rows(),3,tag+': deleted');assert.equal((await stored()).elements.length,3,tag+': and in storage');
  if(!phone){ // the keyboard on a computer
    await p.locator('.layer-row').first().click();await p.keyboard.press('Control+d');await p.waitForTimeout(700);assert.equal(await rows(),4,tag+': Ctrl+D duplicates');
    await p.keyboard.press('Delete');await p.waitForTimeout(700);assert.equal(await rows(),3,tag+': Delete removes');
    await p.keyboard.press('Control+z');await p.waitForTimeout(700);assert.equal(await rows(),4,tag+': Ctrl+Z undoes');
    await p.keyboard.press('Control+Shift+z');await p.waitForTimeout(700);assert.equal(await rows(),3,tag+': Ctrl+Shift+Z redoes');
  }

  // the name, and back to the gallery
  await p.locator('#rec-name').fill('ברכה לסבתא');await p.locator('#rec-name').press('Enter');await p.waitForTimeout(900);
  assert.equal((await stored()).name,'ברכה לסבתא',tag+': name saved');
  assert.equal(await p.locator('#save-pill').getAttribute('data-state'),'saved',tag+': everything is saved');
  await p.locator('#btn-back').click();await p.waitForSelector('#home-grid:not([hidden])');await p.waitForTimeout(400);
  const card=p.locator('article.card');assert.equal(await card.count(),1,tag+': one card');
  assert.equal(await card.locator('.card-name').textContent(),'ברכה לסבתא',tag+': with the name');
  assert.ok((await card.locator('.card-meta').textContent()).includes('3 שכבות'),tag+': and the layer count');
  assert.equal(await card.locator('.card-pic img').count(),1,tag+': and the artwork');
  // the card menu
  await card.locator('.card-more').click();await p.locator('.menu-item',{hasText:'שכפול'}).click();await p.waitForTimeout(900);
  assert.equal(await p.locator('article.card').count(),2,tag+': a copy');
  await p.locator('article.card .card-more').first().click();await p.locator('.menu-item',{hasText:'שינוי שם'}).click();
  await p.locator('dialog[open] input.field').fill('שם אחר');await p.locator('dialog[open] input.field').press('Enter');await p.waitForTimeout(800);
  assert.ok(await p.evaluate(()=>Studio.all().then(l=>l.some(r=>r.name==='שם אחר'))),tag+': renamed from the gallery');
  await p.locator('article.card .card-more').first().click();await p.locator('.menu-item.danger').click();
  await p.locator('dialog[open] .btn.ghost').click();await p.waitForTimeout(400);assert.equal(await p.locator('article.card').count(),2,tag+': "cancel" keeps it');
  await p.locator('article.card .card-more').first().click();await p.locator('.menu-item.danger').click();
  await p.locator('dialog[open] .btn.danger').click();await p.waitForTimeout(800);assert.equal(await p.locator('article.card').count(),1,tag+': deleted after a yes');
  // open again: everything is there
  await p.locator('.card-open').click();await p.waitForSelector('#editor:not([hidden])');await p.waitForTimeout(800);
  assert.equal(await rows(),3,tag+': the layers come back');
  // an unknown address goes home
  await p.goto(base+'/index.html#/e/nope');await p.waitForSelector('#home:not([hidden])');
  assert.deepEqual(errs,[],tag+': no page errors');await ctx.close();
}
console.log('PASS v2-flow: empty gallery, new creation, artwork by file picker, text/particles/pattern layers, inspector tabs, undo/redo, row menu, keyboard, rename, gallery card and its menu; phone and computer');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
