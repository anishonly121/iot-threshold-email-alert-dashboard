(() => {
  let snapshot=null,revision=0;
  const byId=id=>document.getElementById(id);
  function card(title,text,kind='neutral'){const el=document.createElement('article');el.className='care-card '+kind;const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=text;el.append(h,p);return el;}
  window.addEventListener('care-loading',()=>{snapshot=null;revision++;byId('askCare').disabled=true;byId('careSummary').textContent='Refreshing readings… Previous suggestions are withheld until the new readings arrive.';byId('careCards').replaceChildren();byId('aiAdvice').hidden=true;byId('careSource').textContent='Built-in guidance';});
  window.addEventListener('care-error',()=>{byId('careSummary').textContent='Readings could not be refreshed. Try again or explore the demo; no care decision should rely on unavailable data.';});
  window.addEventListener('care-readings',e=>{
    snapshot=e.detail;revision++;byId('askCare').disabled=false;const cards=[];let issues=0;
    for(const [key,label,range] of [['temperature','Temperature',snapshot.thresholds.temp],['humidity','Humidity',snapshot.thresholds.humi]]){
      const value=snapshot[key];
      if(value===null){cards.push(card(label+' unavailable','Check sensor power and connectivity. Stale or missing readings cannot support a care recommendation.','watch'));continue;}
      if(range.max!==null&&value>range.max){issues++;cards.push(card(label+' above your limit',key==='temperature'?'Inspect sun exposure and airflow. If the plant shows heat stress, consider a less exposed spot; check soil before adding water.':'Inspect airflow, condensation and persistently damp soil. Review the plant’s humidity needs before making changes.','watch'));}
      else if(range.min!==null&&value<range.min){issues++;cards.push(card(label+' below your limit',key==='temperature'?'Check for cold drafts and confirm the reading near the plant. Compare conditions with this plant’s preferred temperature.':'Check for dry airflow and leaf changes. Confirm this plant’s humidity needs; low air humidity alone is not a reason to water its roots.','watch'));}
      else cards.push(card(label+(range.min===null&&range.max===null?' needs a target':' within your limits'),range.min===null&&range.max===null?'Set a range appropriate for your plant in Threshold Settings. No universal target is assumed.':'No threshold breach detected. Continue observing the plant; a normal sensor reading does not rule out other problems.'));
    }
    cards.push(card('Check the soil, not just the signal',snapshot.moisture===null?'The soil sensor has no fresh reading. Inspect the soil directly.':'This sensor reports a binary state. Calibrate its wet/dry meaning and inspect soil before deciding to water.'));
    byId('careCards').replaceChildren(...cards);byId('careSummary').textContent=(snapshot.demo?'Demo · ':'Station '+snapshot.station+' · ')+(issues?issues+' threshold '+(issues===1?'breach needs':'breaches need')+' a closer look.':'Review your readings and care targets below.');
  });
  byId('tryDemo').addEventListener('click',()=>{const toggle=byId('demoToggle');if(!toggle.checked)toggle.click();byId('garden').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
  byId('askCare').addEventListener('click',async()=>{
    const output=byId('aiAdvice');output.hidden=false;
    if(!snapshot||Date.now()-snapshot.observedAt>300000){output.textContent='Refresh the readings before requesting AI guidance.';return;}
    const token=byId('alertToken').value.trim();if(!token){output.textContent='AI is available to the dashboard owner. Enter your access token in Threshold Settings first. Built-in guidance remains available above.';return;}
    const current=revision;byId('askCare').disabled=true;output.textContent='Preparing an AI care brief…';
    try{const r=await fetch('/api/care-advice',{method:'POST',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...snapshot,context:byId('plantContext').value})});const data=await r.json();if(current!==revision)return;if(!r.ok)throw Error(data.message||'AI guidance is unavailable.');output.textContent=data.advice;byId('careSource').textContent='AI-generated · '+data.model+(snapshot.demo?' · demo data':'');}
    catch(e){if(current===revision)output.textContent=(e.name==='TimeoutError'?'AI took too long to respond.':e.message)+' Built-in guidance is still available.';}
    finally{if(current===revision)byId('askCare').disabled=false;}
  });
  byId('askCare').disabled=true;
})();
