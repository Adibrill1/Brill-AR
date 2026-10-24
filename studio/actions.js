"use strict";
/* Independent action sequences. Original implementation, not Artivive source.
   Legacy keyframes/scenes/tracks are preserved. No migration runs implicitly. */
const ActionCore = (() => {
  const kinds={move:['x','y','z'],rotate:['rot'],scale:['scale'],opacity:['opacity'],show:['visible'],hide:['visible'],interaction:['tap'],model:['model'],media:['media']};
  const eases=['linear','easeIn','easeOut','easeInOut','elastic','bounce'];
  const list=rec=>Array.isArray(rec.actionSequences)?rec.actionSequences:[];
  const base=el=>({x:el.x||0,y:el.y||0,z:el.z||0,rot:el.rot||0,scale:1,opacity:el.opacity==null?1:el.opacity,visible:true,tap:el.onTap||'none'});
  function ease(f,type) {
    if(type==='easeIn')return f*f;
    if(type==='easeOut')return 1-(1-f)*(1-f);
    if(type==='easeInOut')return f<.5?2*f*f:1-2*(1-f)*(1-f);
    if(type==='elastic')return f<=0?0:f>=1?1:2**(-10*f)*Math.sin((f*10-.75)*(2*Math.PI/3))+1;
    if(type==='bounce'){const n=7.5625,d=2.75;if(f<1/d)return n*f*f;if(f<2/d){f-=1.5/d;return n*f*f+.75;}if(f<2.5/d){f-=2.25/d;return n*f*f+.9375;}f-=2.625/d;return n*f*f+.984375;}
    return f;
  }
  function validate(rec) {
    if(rec.actionSequences==null)return null;
    if(!Array.isArray(rec.actionSequences)||rec.actionSequences.length>24)return 'עד24רצפי פעולות';
    const ids=new Set(), actionIds=new Set(), layers=new Set((rec.elements||[]).map(e=>e.id));
    const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
    for(const q of rec.actionSequences){
      if(!q||!validId(q.id)||ids.has(q.id))return 'מזהה רצף לא תקין או כפול';ids.add(q.id);
      if(typeof q.name!=='string'||q.name.length>120)return 'שם רצף לא תקין';
      if(!Number.isFinite(q.duration)||q.duration<.1||q.duration>3600)return 'משך רצף לא תקין';
      for(const k of ['loop','reset','autoStart'])if(typeof q[k]!=='boolean')return 'אפשרות רצף לא תקינה';
      if(!Array.isArray(q.actions)||q.actions.length>300)return 'עד300פעולות ברצף';
      for(const a of q.actions){
        if(!a||!validId(a.id)||actionIds.has(a.id))return 'מזהה פעולה לא תקין או כפול';actionIds.add(a.id);
        if(!Object.hasOwn(kinds,a.type)||!layers.has(a.layerId))return 'פעולה ללא סוג או שכבת יעד תקינה';
        if(!Number.isFinite(a.start)||a.start<0||!Number.isFinite(a.duration)||a.duration<0||a.start+a.duration>q.duration)return 'פעולה מחוץ לאורך הרצף';
        if(!eases.includes(a.ease))return 'עקומת פעולה לא תקינה';
        if(!a.to||typeof a.to!=='object'||Array.isArray(a.to))return 'יעד פעולה חסר';
        for(const k of kinds[a.type])if(['visible','tap','model','media'].includes(k))continue;else if(!Number.isFinite(a.to[k])||Math.abs(a.to[k])>10000)return 'ערך יעד לא תקין';
        if(a.type==='scale'&&a.to.scale<=0)return 'גודל חייב להיות חיובי';
        if(a.type==='opacity'&&(a.to.opacity<0||a.to.opacity>1))return 'שקיפות בין0ל1';
        if(a.type==='model'){
          const el=rec.elements.find(e=>e.id===a.layerId);if(el.type!=='model')return 'אנימציית מודל דורשת שכבת מודל';
          if(!Number.isInteger(a.to.clip)||a.to.clip<0||a.to.clip>99||!Number.isFinite(a.to.speed)||a.to.speed<.1||a.to.speed>4||typeof a.to.loop!=='boolean')return 'הגדרות אנימציית מודל לא תקינות';
        }
        if(a.type==='media'){
          const el=rec.elements.find(e=>e.id===a.layerId);if(!['video','sound'].includes(el.type))return 'פעולת ניגון דורשת צליל או וידאו';
          if(!Number.isFinite(a.to.offset)||a.to.offset<0||a.to.offset>3600)return 'נקודת התחלת מדיה לא תקינה';
        }
        if(a.type==='interaction'&&(typeof a.to.tap!=='string'||a.to.tap.length>160||!(/^(none|mute|sequence|seq:[A-Za-z0-9_-]+|track:[A-Za-z0-9_-]+|action:[A-Za-z0-9_-]+)$/.test(a.to.tap))))return 'פעולת הקשה לא תקינה';
      }
    }
    for(const q of rec.actionSequences)for(const a of q.actions)if(a.type==='interaction'&&a.to.tap.startsWith('action:')&&!ids.has(a.to.tap.slice(7)))return 'הפניה לרצף חסר';
    for(const e of rec.elements||[])if(e.onTap&&e.onTap.startsWith('action:')&&!ids.has(e.onTap.slice(7)))return 'הקשה מפנה לרצף חסר';
    return null;
  }
  // Every action starts from the value produced at its start by earlier-starting
  // actions in the SAME sequence. Concurrent sequences never mutate that baseline.
  function sampleSequence(rec,q,t) {
    const result={}, sorted=q.actions.map((a,i)=>({...a,index:i})).sort((a,b)=>a.start-b.start||a.index-b.index);
    const prepared=[];
    function at(layer,prop,time,candidates){
      let winner=null;
      for(const p of candidates)if(p.a.layerId===layer&&p.props.includes(prop)&&p.a.start<=time){
        if(!winner||p.end>winner.end||p.end===winner.end&&p.a.index>winner.a.index)winner=p;
      }
      if(!winner)return undefined;
      const {a,from}=winner;
      if(prop==='visible')return a.type==='show';
      if(prop==='tap')return a.to.tap;
      if(prop==='model')return {clip:a.to.clip,speed:a.to.speed,loop:a.to.loop,time:Math.min(a.duration,Math.max(0,time-a.start))*a.to.speed};
      if(prop==='media')return {time:a.to.offset+Math.min(a.duration,Math.max(0,time-a.start)),playing:time<a.start+a.duration};
      const f=a.duration>0?Math.min(1,Math.max(0,(time-a.start)/a.duration)):1;
      return from[prop]+(a.to[prop]-from[prop])*ease(f,a.ease);
    }
    for(const a of sorted){
      const el=rec.elements.find(e=>e.id===a.layerId);if(!el||!kinds[a.type])continue;
      const from=base(el),props=kinds[a.type];
      for(const p of props){const v=at(a.layerId,p,a.start,prepared.filter(p=>p.a.start<a.start));if(v!==undefined)from[p]=v;}
      prepared.push({a,props,from,end:a.start+a.duration});
    }
    for(const p of prepared)if(p.a.start<=t){const id=p.a.layerId;result[id]||={};for(const key of p.props)result[id][key]=at(id,key,t,prepared);}
    return result;
  }
  function create(rec,now=()=>performance.now()/1000){
    const runs=new Map();let serial=0,paused=false,pauseAt=0;
    const clock=()=>paused?pauseAt:now();
    const api={
      start(id){const q=list(rec).find(q=>q.id===id);if(!q)return false;runs.set(id,{start:clock(),order:++serial});return true;},
      stop(id){runs.delete(id);},
      toggle(id){if(api.isPlaying(id))api.stop(id);else api.start(id);},
      isPlaying(id){const r=runs.get(id),q=list(rec).find(q=>q.id===id);return !!(r&&q&&(q.loop||clock()-r.start<q.duration));},
      reset(){runs.clear();},
      autoStart(){for(const q of list(rec))if(q.autoStart)api.start(q.id);},
      pause(){if(!paused){pauseAt=now();paused=true;}},
      resume(){if(paused){const delta=now()-pauseAt;for(const r of runs.values())r.start+=delta;paused=false;}},
      seek(id,t){api.reset();const q=list(rec).find(q=>q.id===id);if(q){runs.set(id,{start:clock()-Math.min(q.duration,Math.max(0,t)),order:++serial,seek:true,seekTime:Math.min(q.duration,Math.max(0,t))});}},
      isPaused(){return paused||[...runs.values()].some(r=>r.seek);},
      snapshot(){const out={};for(const q of list(rec)){const r=runs.get(q.id);if(r)out[q.id]={time:Math.max(0,clock()-r.start),playing:api.isPlaying(q.id)};}return out;},
      values(){const out={};for(const [id,r]of [...runs].sort((a,b)=>a[1].order-b[1].order)){
        const q=list(rec).find(q=>q.id===id);if(!q){runs.delete(id);continue;}
        let t=r.seek?r.seekTime:Math.max(0,clock()-r.start);
        if(!q.loop&&t>=q.duration&&q.reset&&!r.seek){runs.delete(id);continue;}
        t=q.loop?t%q.duration:Math.min(q.duration,t);
        for(const [layer,values]of Object.entries(sampleSequence(rec,q,t)))out[layer]={...out[layer],...values};
      }return out;}
    };return api;
  }
  return {kinds,eases,list,base,ease,validate,sampleSequence,create};
})();
if(typeof module!=='undefined')module.exports=ActionCore;
