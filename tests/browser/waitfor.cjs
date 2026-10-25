/* Node-side poll that correctly awaits ASYNC predicates.
 * playwright-core 1.64.1 page.waitForFunction resolves IMMEDIATELY when the
 * predicate returns a promise: the pending Promise object is itself truthy, so
 * the predicate's real value is never inspected and falsy async results never
 * re-poll (verified empirically: async predicate + 700ms-delayed condition
 * "passed" in ~30ms). page.evaluate awaits async functions properly, so poll here. */
module.exports=async function waitFor(page,fn,arg,timeout=25000){
  const t=Date.now();
  for(;;){
    if(await page.evaluate(fn,arg))return true;
    if(Date.now()-t>timeout)throw new Error('waitFor timeout after '+timeout+'ms: '+String(fn).slice(0,120));
    await new Promise(r=>setTimeout(r,50));
  }
};
