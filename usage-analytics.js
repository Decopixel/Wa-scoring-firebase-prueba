/* WA Scoring v0.6.4.18 — métricas seudónimas de uso, no nombres ni puntajes.
 * La presencia Firestore es aproximada: un heartbeat cada 120 s mientras la PWA es visible.
 * Los días offline se acumulan localmente y se reportan cuando vuelve internet.
 */
// Importaciones diferidas para que el registro offline funcione sin acceso a gstatic.
let getApp, getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp;
const VERSION='0.6.4.18', OPT_OUT='wa-usage-opt-out-v1', QUEUE='wa-usage-pending-v1';
const HEARTBEAT_MS=120000, CHECK_MS=8000;
let enabled=true, cloud=null, store=null, userId='', lastMode='', lastDay='', lastPing=0, sending=false;
let createdPresence=false, setupPromise=null, lastRecordedMode='', lastRecordedDay='';
try{enabled=localStorage.getItem(OPT_OUT)!=='1';}catch(_){enabled=false;}
const dayOf=d=>d.toISOString().slice(0,10).replaceAll('-','');
const stateForPage=p=>{
 if(['score','new'].includes(p))return 'entrenando';
 if(['event-score','elim-remote','cloud-join'].includes(p))return 'anotador';
 if(['competitions','event-new','event-detail','personal-history','personal-detail'].includes(p))return 'competencia';
 if(String(p).startsWith('spectator'))return 'espectador';
 return 'inicio';
};
function readPending(){
 try{const a=JSON.parse(localStorage.getItem(QUEUE)||'[]');return Array.isArray(a)?a.filter(x=>/^\d{8}$/.test(x.day)&&Array.isArray(x.modes)).slice(-35):[];}
 catch(_){return [];}
}
function savePending(q){try{localStorage.setItem(QUEUE,JSON.stringify(q.slice(-35)));}catch(_){}}
function recordLocal(mode){
 const day=dayOf(new Date()),arr=readPending();let data=arr.find(x=>x.day===day);
 if(!data){data={day,modes:[]};arr.push(data);}
 if(!data.modes.includes(mode))data.modes.push(mode);
 savePending(arr);return day;
}
async function connect(){
 if(store&&userId)return;
 if(setupPromise)return setupPromise;
 setupPromise=(async()=>{
  // Reutiliza Authentication/Firestore de WA Scoring, sin cuentas nuevas para el usuario.
  const [appMod,storeMod]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
  ]);
  ({getApp}=appMod);({getFirestore,doc,getDoc,setDoc,updateDoc,serverTimestamp,Timestamp}=storeMod);
  cloud=await import('./cloud.js?v=0.6.4.18');
  await cloud.initialize();
  userId=cloud.currentUid()||'';
  if(!userId)throw Error('Firebase Auth no disponible');
  store=getFirestore(getApp());
 })().finally(()=>{setupPromise=null;});
 return setupPromise;
}
async function sendDays(){
 if(!enabled||!store||!userId)return;
 const pending=readPending();
 for(const item of pending){
  if(!/^\d{8}$/.test(item.day))continue;
  const flags={};
  for(const name of item.modes){if(['entrenando','competencia','anotador','espectador'].includes(name))flags[name]=true;}
  await setDoc(doc(store,'waUsageDays',`${item.day}_${userId}`),
   {uid:userId,day:item.day,lastSeenAt:serverTimestamp(),expiresAt:Timestamp.fromDate(new Date(Date.now()+91*86400000)),...flags},{merge:true});
  // Solo quitar la entrada sincronizada; no borrar otras añadidas mientras se esperaba.
  const latest=readPending();
  savePending(latest.filter(x=>x.day!==item.day));
 }
}
async function sendPresence(mode){
 const ref=doc(store,'waUsageDevices',userId);
 const values={uid:userId,mode,version:VERSION,lastSeenAt:serverTimestamp()};
 if(!createdPresence){
  const previous=await getDoc(ref);
  if(previous.exists())createdPresence=true;
  else{
   await setDoc(ref,{...values,createdAt:serverTimestamp(),expiresAt:Timestamp.fromDate(new Date(Date.now()+91*86400000))});
   createdPresence=true;return;
  }
 }
 await updateDoc(ref,{mode,version:VERSION,lastSeenAt:serverTimestamp(),expiresAt:Timestamp.fromDate(new Date(Date.now()+91*86400000))});
}
async function sync(force=false){
 if(!enabled||document.visibilityState!=='visible')return;
 const page=document.body.dataset.waPage;
 if(!page)return;
 const mode=stateForPage(page),now=Date.now(),day=dayOf(new Date());
 if(mode!==lastRecordedMode||day!==lastRecordedDay){recordLocal(mode);lastRecordedMode=mode;lastRecordedDay=day;}
 // Sin internet se conserva un resumen local sin detener entrenamientos.
 if(!navigator.onLine||sending)return;
 if(!force&&mode===lastMode&&day===lastDay&&now-lastPing<HEARTBEAT_MS&&!readPending().length)return;
 sending=true;
 try{
  await connect();
  await sendDays();
  if(force||mode!==lastMode||day!==lastDay||now-lastPing>=HEARTBEAT_MS){
   await sendPresence(mode);lastPing=Date.now();lastMode=mode;lastDay=day;
  }
 }catch(_){/* La app y sus entrenamientos nunca dependen de la telemetría. */}
 finally{sending=false;}
}
function toggle(){
 enabled=!enabled;
 try{localStorage.setItem(OPT_OUT,enabled?'0':'1');if(!enabled)localStorage.removeItem(QUEUE);}catch(_){ }
 const status=document.getElementById('wa-usage-state');if(status)status.textContent=enabled?'Activadas':'Desactivadas';
 const button=document.getElementById('wa-usage-toggle');if(button)button.textContent=enabled?'Desactivar métricas de uso':'Activar métricas de uso';
 if(enabled){lastPing=0;lastRecordedMode='';lastRecordedDay='';sync(true);}
 // La opción desactiva comunicaciones futuras; no elimina registros históricos del servidor.
}
document.addEventListener('click',event=>{if(event.target.closest('#wa-usage-toggle'))toggle();});
function updateUI(){const status=document.getElementById('wa-usage-state');if(status)status.textContent=enabled?'Activadas':'Desactivadas';
 const button=document.getElementById('wa-usage-toggle');if(button)button.textContent=enabled?'Desactivar métricas de uso':'Activar métricas de uso';}
window.WAUsageMetrics={get enabled(){return enabled;},sync};
setInterval(()=>{updateUI();const page=document.body.dataset.waPage;if(page&&enabled){sync();}},CHECK_MS);
window.addEventListener('online',()=>sync(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync(true);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{updateUI();setTimeout(()=>sync(true),2500);});
else{updateUI();setTimeout(()=>sync(true),2500);}
