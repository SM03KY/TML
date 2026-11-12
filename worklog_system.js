const $=id=>document.getElementById(id);
const KEY='worklog_v1';
const DB_NAME='worklog_db';
const STORE_NAME='worklogs';
let db=null, logs=[], editing=null;

function supportsIndexedDB(){return 'indexedDB' in window;}
function openDatabase(){
  if(!supportsIndexedDB()) return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const database=request.result;
      if(!database.objectStoreNames.contains(STORE_NAME)){
        database.createObjectStore(STORE_NAME,{keyPath:'date'});
      }
    };
    request.onsuccess=()=>{
      db=request.result;
      resolve(db);
    };
    request.onerror=()=>reject(request.error || new Error('Could not open worklog database'));
  });
}
function migrateLegacyStorage(){
  const legacy=localStorage.getItem(KEY);
  if(!legacy || !db) return Promise.resolve();
  try {
    const parsed=JSON.parse(legacy);
    if(!Array.isArray(parsed) || !parsed.length) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      const store=tx.objectStore(STORE_NAME);
      parsed.forEach(item=>store.put(item));
      tx.oncomplete=()=>{
        localStorage.removeItem(KEY);
        resolve();
      };
      tx.onerror=()=>reject(tx.error || new Error('Legacy data migration failed'));
    });
  } catch (error) {
    return Promise.resolve();
  }
}
function loadLogsFromDatabase(){
  if(!db) return Promise.resolve([]);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,'readonly');
    const store=tx.objectStore(STORE_NAME);
    const request=store.getAll();
    request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result:[]);
    request.onerror=()=>reject(request.error || new Error('Could not load saved work logs'));
  });
}
async function initializeLogs(){
  await openDatabase();
  await migrateLegacyStorage();
  if(db){
    logs=await loadLogsFromDatabase();
  } else {
    logs=JSON.parse(localStorage.getItem(KEY)||'[]');
  }
  $('date').value=new Date().toISOString().slice(0,10);
}
function mins(t){if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m}
function duration(a,b){const x=mins(a),y=mins(b);if(x===null||y===null)return 0;return y>=x?y-x:0}
function fmt(m){m=Math.max(0,Math.round(m));return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`}
function fmtClock12(t){
 if(!t)return '—';
 const [hour,minute]=t.split(':').map(Number),period=hour>=12?'PM':'AM';
 return `${hour%12||12}:${String(minute).padStart(2,'0')} ${period}`;
}
function totalFor(l){return duration(l.amIn,l.amOut)+duration(l.pmIn,l.pmOut)}
function save(){
  if(db){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      const store=tx.objectStore(STORE_NAME);
      store.clear();
      logs.forEach(item=>store.put(item));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error || new Error('Could not save logs to database'));
    });
  }
  localStorage.setItem(KEY,JSON.stringify(logs));
  return Promise.resolve();
}
function update(){
 const total=logs.reduce((s,l)=>s+totalFor(l),0), req=Math.max(1,Number($('required').value)||486)*60, left=Math.max(0,req-total), pct=Math.min(100,total/req*100);
 $('total').textContent=fmt(total);$('requiredDisplay').textContent=fmt(req);$('remaining').textContent=fmt(left);$('days').textContent=logs.length;
 $('progressBar').style.width=pct+'%';$('progressText').textContent=`${pct.toFixed(1)}% completed · ${fmt(total)} of ${fmt(req)}`;
 $('logRows').innerHTML='';$('empty').style.display=logs.length?'none':'block';
 [...logs].sort((a,b)=>b.date.localeCompare(a.date)).forEach(l=>{
  const tr=document.createElement('tr');
  const cells=[l.date,`${fmtClock12(l.amIn)} – ${fmtClock12(l.amOut)}`,`${fmtClock12(l.pmIn)} – ${fmtClock12(l.pmOut)}`,fmt(totalFor(l)),l.remarks||'—'];
  cells.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});
  const td=document.createElement('td'),edit=document.createElement('button'),del=document.createElement('button');
  edit.textContent='Edit';edit.className='secondary';edit.style.marginRight='5px';edit.onclick=()=>loadEdit(l.date);
  del.textContent='Delete';del.className='danger';del.onclick=()=>{if(confirm('Delete this work log?')){logs=logs.filter(x=>x.date!==l.date);save().then(update)}};
  td.append(edit,del);tr.appendChild(td);$('logRows').appendChild(tr);
 });
}
function reset(){editing=null;$('date').value=new Date().toISOString().slice(0,10);$('amIn').value='08:00';$('amOut').value='12:00';$('pmIn').value='13:00';$('pmOut').value='17:00';$('remarks').value='';$('saveBtn').textContent='Save work log'}
function loadEdit(date){const l=logs.find(x=>x.date===date);if(!l)return;editing=date;$('date').value=l.date;$('amIn').value=l.amIn;$('amOut').value=l.amOut;$('pmIn').value=l.pmIn;$('pmOut').value=l.pmOut;$('remarks').value=l.remarks||'';$('saveBtn').textContent='Update work log';window.scrollTo({top:0,behavior:'smooth'})}
$('saveBtn').onclick=async()=>{
 const date=$('date').value, l={date,amIn:$('amIn').value,amOut:$('amOut').value,pmIn:$('pmIn').value,pmOut:$('pmOut').value,remarks:$('remarks').value.trim()};
 if(!date){$('formMessage').textContent='Please choose a date.';return}
 const amA=mins(l.amIn),amB=mins(l.amOut),pmA=mins(l.pmIn),pmB=mins(l.pmOut);
 if((l.amIn&&!l.amOut)||(!l.amIn&&l.amOut)||(l.pmIn&&!l.pmOut)||(!l.pmIn&&l.pmOut)){ $('formMessage').textContent='Enter both time-in and time-out for each session you worked.';return}
 if((amA!==null&&amB<=amA)||(pmA!==null&&pmB<=pmA)){ $('formMessage').textContent='Time-out must be later than time-in. Overnight shifts are not supported.';return}
 if(totalFor(l)<=0){$('formMessage').textContent='Enter at least one complete work session.';return}
 if(!editing&&logs.some(x=>x.date===date)){if(!confirm('A log already exists for this date. Replace it?'))return;logs=logs.filter(x=>x.date!==date)}
 else if(editing&&editing!==date)logs=logs.filter(x=>x.date!==editing);
 logs=logs.filter(x=>x.date!==date);logs.push(l);await save();update();$('formMessage').textContent=`Saved. Daily total: ${fmt(totalFor(l))}.`;reset();
};
$('clearBtn').onclick=()=>{reset();$('formMessage').textContent=''};
$('applySettings').onclick=()=>{if(Number($('required').value)<1||Number($('dailyTarget').value)<=0){alert('Enter valid positive settings.');return}update()};
$('clearAllBtn').onclick=async()=>{if(confirm('Permanently delete all saved logs from this browser?')){logs=[];await save();update()}};
$('exportBtn').onclick=()=>{
 const rows=[['Date','Morning In','Morning Out','Afternoon In','Afternoon Out','Total Minutes','Total Hours','Remarks'],...logs.sort((a,b)=>a.date.localeCompare(b.date)).map(l=>[l.date,fmtClock12(l.amIn),fmtClock12(l.amOut),fmtClock12(l.pmIn),fmtClock12(l.pmOut),totalFor(l),(totalFor(l)/60).toFixed(2),l.remarks||''])];
 const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='work-logs.csv';a.click();URL.revokeObjectURL(url);
};

function parseClock12(s){
 const m=s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
 if(!m)return null;
 let h=Number(m[1]),min=Number(m[2]),ap=m[3].toUpperCase();
 if(h<1||h>12||min>59)return null;
 h=h%12+(ap==='PM'?12:0);
 return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
}
function parseImportedLine(line){
 const normalized=line.trim()
  .replace(/^\*+\s*/, '')
  .replace(/^(?:[-*•]\s*)+/, '')
  .replace(/^\*+\s*/, '')
  .replace(/\s*\*+$/, '')
  .trim();
 const dateMatch=normalized.match(/^(\d{4}-\d{2}-\d{2})(?:\s*\(([^)]*)\))?\s*:\s*/);
 if(!dateMatch)return {error:'Missing date in YYYY-MM-DD format'};
 const date=dateMatch[1], rest=normalized.slice(dateMatch[0].length);
 const clockOrBlank='((?:\\d{1,2}:\\d{2}\\s*[AP]M|--:--)?)';
 const am=rest.match(new RegExp('Morning\\s*\\[\\s*'+clockOrBlank+'\\s*-\\s*'+clockOrBlank+'\\s*\\]','i'));
 const pm=rest.match(new RegExp('Afternoon\\s*\\[\\s*'+clockOrBlank+'\\s*-\\s*'+clockOrBlank+'\\s*\\]','i'));
 if(!am&&!pm)return {error:'No Morning or Afternoon time range found'};
 const toTime=value=>!value||value==='--:--'?'':parseClock12(value);
 const l={date,amIn:am?toTime(am[1]):'',amOut:am?toTime(am[2]):'',pmIn:pm?toTime(pm[1]):'',pmOut:pm?toTime(pm[2]):'',remarks:dateMatch[2]?dateMatch[2].trim():'Imported'};
 const invalidRange=(match,start,end)=>{
  if(!match)return false;
  const startBlank=!match[1]||match[1]==='--:--',endBlank=!match[2]||match[2]==='--:--';
  return startBlank!==endBlank||(!startBlank&&(!start||!end));
 };
 if(invalidRange(am,l.amIn,l.amOut)||invalidRange(pm,l.pmIn,l.pmOut))return {error:'Invalid 12-hour time'};
 if((l.amIn&&duration(l.amIn,l.amOut)<=0)||(l.pmIn&&duration(l.pmIn,l.pmOut)<=0))return {error:'Time-out must be later than time-in'};
 return {log:l};
}
$('sampleBtn').onclick=()=>{$('importText').value='2026-08-26: Morning [7:30 AM - 12:01 PM], Afternoon [12:59 PM - 6:30 PM] = 10h 2m (10.03 hrs)'};
$('importBtn').onclick=async()=>{
 const lines=$('importText').value.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!/^\*+$/.test(x)&&!/^Accumulated Total\s*:/i.test(x));
 if(!lines.length){$('importMessage').textContent='Paste at least one work-log line first.';return}
 let added=0,updated=0,errors=[];
 lines.forEach((line,i)=>{
  const parsed=parseImportedLine(line);
  if(parsed.error){errors.push(`Line ${i+1}: ${parsed.error}`);return}
  const l=parsed.log,idx=logs.findIndex(x=>x.date===l.date);
  if(idx>=0){logs[idx]=l;updated++}else{logs.push(l);added++}
 });
 await save();update();
 $('importMessage').textContent=`Import complete: ${added} new, ${updated} replaced.${errors.length?' Issues: '+errors.join(' | '):''}`;
};

initializeLogs().then(update).catch(()=>{
  logs=JSON.parse(localStorage.getItem(KEY)||'[]');
  update();
});
