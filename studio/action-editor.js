"use strict";
const ActionEditor=(()=>{
 const names={move:'תנועה',rotate:'סיבוב',scale:'גודל',opacity:'שקיפות',show:'הצגה',hide:'הסתרה',interaction:'שינוי הקשה',model:'אנימציית מודל',media:'ניגון צליל/וידאו'};
 let selected=null,selectedAction=null;
 function mount(root,ctx){
  const {rec,engine}=ctx,seqs=ActionCore.list(rec);if(!seqs.some(q=>q.id===selected))selected=seqs[0]?.id;
  root.replaceChildren();
  const node=(tag,text,parent=root)=>{const e=document.createElement(tag);if(text)e.textContent=text;parent.append(e);return e;};
  const button=(text,fn,parent=root)=>{const b=node('button',text,parent);b.type='button';b.onclick=fn;return b;};
  const field=(text,value,fn,parent=root,type='number')=>{const l=node('label',text,parent),i=node('input',null,l);i.type=type;i.value=value;if(type==='number')i.step='.1';i.onchange=()=>fn(type==='number'?Number(i.value):i.value);return i;};
  const save=()=>{const error=ActionCore.validate(rec);if(error){ctx.message(error);return false;}ctx.changed();return true;};
  node('h3','רצפי פעולות על שכבות משותפות');
  const top=node('div');top.className='row';
  const select=node('select',null,top);select.setAttribute('aria-label','רצף פעולות');
  for(const q of seqs){const o=node('option',q.name,select);o.value=q.id;}select.value=selected||'';select.onchange=()=>{selected=select.value;selectedAction=null;mount(root,ctx);};
  button('+ רצף',()=>{if(seqs.length>=24)return ctx.message('עד24רצפים');rec.actionSequences=seqs.concat([{id:Studio.newId(),name:'רצף '+(seqs.length+1),duration:5,loop:false,reset:true,autoStart:false,actions:[]}]);selected=rec.actionSequences.at(-1).id;save();},top);
  const q=seqs.find(q=>q.id===selected);
  if(!q){node('p','שכבה אחת יכולה לקבל פעולות מכמה רצפים. הוסיפי רצף ואז פעולות.');return;}
  field('שם הרצף',q.name,v=>{q.name=v.slice(0,120);save();},root,'text');
  const options=node('div');options.className='row';
  field('משך בשניות',q.duration,v=>{const min=Math.max(.1,...q.actions.map(a=>a.start+a.duration));q.duration=Math.min(3600,Math.max(min,v||min));save();},options);
  for(const [k,title]of [['loop','חזרה'],['reset','איפוס בסיום'],['autoStart','מתחיל אוטומטית']]){const l=node('label',title,options),c=node('input',null,l);c.type='checkbox';c.checked=q[k];c.onchange=()=>{q[k]=c.checked;save();};}
  button('ניגון מהתחלה',()=>{engine.start(q.id);ctx.redraw();},options);
  button('עצירה ושחרור',()=>{engine.stop(q.id);ctx.redraw();},options);
  button('שכפול רצף',()=>{if(seqs.length>=24)return;const copy=JSON.parse(JSON.stringify(q));copy.id=Studio.newId();copy.name=(q.name+' עותק').slice(0,120);copy.actions.forEach(a=>a.id=Studio.newId());rec.actionSequences.push(copy);selected=copy.id;save();},options);
  button('מחיקת רצף',()=>{rec.actionSequences=seqs.filter(s=>s.id!==q.id);for(const s of rec.actionSequences)for(const a of s.actions)if(a.to.tap==='action:'+q.id)a.to.tap='none';for(const el of rec.elements)if(el.onTap==='action:'+q.id)el.onTap='none';engine.stop(q.id);save();},options);
  const playhead=field('בדיקה בזמן',0,v=>{engine.seek(q.id,v);ctx.redraw();});playhead.min=0;playhead.max=q.duration;playhead.dataset.actionSeek='true';
  const ruler=node('div');ruler.className='action-ruler';ruler.dir='ltr';ruler.textContent='0s';node('span',q.duration+'s',ruler);
  for(const a of q.actions){
    const row=node('div');row.className='action-row';
    const el=rec.elements.find(e=>e.id===a.layerId);
    const label=button(names[a.type]+' · '+(el?.name||el?.type||'שכבה חסרה'),()=>{selectedAction=a.id;ctx.select(a.layerId);mount(root,ctx);},row);label.className='action-label';
    const rail=node('div',null,row);rail.className='action-rail';rail.dir='ltr';
    const bar=button(a.start+'s · '+a.duration+'s',()=>{selectedAction=a.id;mount(root,ctx);},rail);bar.className='action-bar';bar.style.left=(a.start/q.duration*100)+'%';bar.style.width=Math.max(5,a.duration/q.duration*100)+'%';
    // Drag translates the action as a whole; resize remains exact via duration field.
    bar.onpointerdown=e=>{const x=e.clientX,start=a.start,w=rail.getBoundingClientRect().width;let moved=false;bar.setPointerCapture(e.pointerId);bar.onpointermove=ev=>{const delta=(ev.clientX-x)/w*q.duration;if(Math.abs(delta)>.02)moved=true;a.start=Math.round(Math.max(0,Math.min(q.duration-a.duration,start+delta))*10)/10;bar.style.left=a.start/q.duration*100+'%';bar.textContent=a.start+'s · '+a.duration+'s';};bar.onpointerup=()=>{bar.onpointermove=null;if(moved)save();};};
  }
  const add=node('div');add.className='row';
  const types=node('select',null,add);types.setAttribute('aria-label','סוג פעולה חדשה');for(const [value,title]of Object.entries(names)){const o=node('option',title,types);o.value=value;}
  button('+ פעולה על השכבה שנבחרה',()=>{const el=rec.elements.find(e=>e.id===ctx.selectedId);if(!el)return ctx.message('בחרי שכבה ברשימה או על היצירה לפני הוספת פעולה');const type=types.value,b=ActionCore.base(el),to={};for(const k of ActionCore.kinds[type])to[k]=b[k];if(type==='interaction')to.tap='none';if(type==='move')to.x+=.15;if(type==='model'){delete to.model;Object.assign(to,{clip:el.modelClip||0,speed:el.modelSpeed||1,loop:false});}if(type==='media'){delete to.media;to.offset=0;}
    const a={id:Studio.newId(),layerId:el.id,type,start:0,duration:['show','hide','interaction'].includes(type)?0:Math.min(1,q.duration),ease:'linear',to};q.actions.push(a);selectedAction=a.id;if(!save()){q.actions=q.actions.filter(x=>x!==a);selectedAction=null;}},add);
  const a=q.actions.find(a=>a.id===selectedAction);
  if(a){const box=node('div');box.className='action-details';node('strong','עריכת '+names[a.type],box);
    const layer=node('select',null,box);layer.setAttribute('aria-label','שכבת יעד');for(const e of rec.elements){const o=node('option',e.name||e.type,layer);o.value=e.id;}layer.value=a.layerId;layer.onchange=()=>{a.layerId=layer.value;save();};
    field('התחלה בשניות',a.start,v=>{a.start=Math.max(0,Math.min(q.duration-a.duration,v||0));save();},box);
    field('משך בשניות',a.duration,v=>{a.duration=Math.max(0,Math.min(q.duration-a.start,v||0));save();},box);
    const ease=node('select',null,box);ease.setAttribute('aria-label','עקומת מהירות');for(const type of ActionCore.eases){const o=node('option',({linear:'קבועה',easeIn:'האצה',easeOut:'האטה',easeInOut:'האצה והאטה',elastic:'אלסטית',bounce:'קפיצות'}[type]),ease);o.value=type;}ease.value=a.ease;ease.onchange=()=>{a.ease=ease.value;save();};
    for(const k of ActionCore.kinds[a.type])if(k==='model'){
      field('מספר אנימציה',a.to.clip,v=>{const old=a.to.clip;a.to.clip=Math.max(0,Math.floor(v||0));if(!save())a.to.clip=old;},box);
      field('מהירות',a.to.speed,v=>{a.to.speed=Math.max(.1,Math.min(4,v||1));save();},box);
      const l=node('label','חזרה בתוך הפעולה',box),c=node('input',null,l);c.type='checkbox';c.checked=a.to.loop;c.onchange=()=>{a.to.loop=c.checked;save();};
    }else if(k==='media')field('התחלת קובץ בשניות',a.to.offset,v=>{a.to.offset=Math.max(0,Math.min(3600,v||0));save();},box);
    else if(k==='tap'){const tap=node('select',null,box);for(const [v,title]of [['none','ללא הקשה'],['mute','השתקה'],...seqs.map(s=>['action:'+s.id,'הפעלת '+s.name])]){const o=node('option',title,tap);o.value=v;}tap.value=a.to.tap;tap.onchange=()=>{a.to.tap=tap.value;save();};}else if(k!=='visible')field('יעד '+({x:'אופקי',y:'אנכי',z:'עומק',rot:'מעלות',scale:'גודל יחסי',opacity:'שקיפות'}[k]),a.to[k],v=>{const old=a.to[k];a.to[k]=v;if(!save())a.to[k]=old;},box);
    button('מחיקת פעולה',()=>{q.actions=q.actions.filter(x=>x!==a);save();},box);
  }
  const note=node('p','כללי המימוש שלנו: הקשה חוזרת מתחילה מחדש. בחפיפה באותו רצף, הפעולה שמסתיימת מאוחר יותר גוברת; בשוויון, המאוחרת ברשימה. בין רצפים, ההפעלה האחרונה גוברת רק בערכים שהיא משנה. שכבה שיש עליה פעולות משתמשת במצב הבסיס במקום נקודות הזמן הישנות. איפוס משחרר את ערכי הרצף; ללא איפוס ערך הסיום נשמר. אלה בחירות תכנון שלנו, לא התנהגות Artivive שאומתה.');note.className='hint';
 }
 return {mount};
})();
