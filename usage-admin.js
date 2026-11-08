/* WA Scoring v0.6.4.18 — exclusivamente lecturas permitidas por reglas Firestore.
 * El enlace no es secreto: el control REAL es waUsageAdmins/{auth.uid}.
 */
import {getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getFirestore, doc, getDoc, collection, getDocs, query, where} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const $=id=>document.getElementById(id), TODAY=()=>new Date().toISOString().slice(0,10).replaceAll('-','');
let db=null,uid='',authorized=false,busy=false;
function state(text,error=false){$('wa-admin-state').innerHTML='';const p=document.createElement('p');p.textContent=text;if(error)p.className='admin-error';$('wa-admin-state').append(p);}
function put(id,value){$(id).textContent=String(value);}
function dateDaysAgo(n){const t=new Date();t.setUTCHours(0,0,0,0);t.setUTCDate(t.getUTCDate()-n);return TODAY_from(t);}
function TODAY_from(d){return d.toISOString().slice(0,10).replaceAll('-','');}
async function refresh(){
 if(!authorized||busy)return;busy=true;state('Consultando datos autorizados…');
 try{
  const since=dateDaysAgo(29),today=TODAY(),since7=dateDaysAgo(6),activeSince=Date.now()-180000;
  const [presence,days]=await Promise.all([
    getDocs(collection(db,'waUsageDevices')),
    getDocs(query(collection(db,'waUsageDays'),where('day','>=',since)))
  ]);
  const allDevices=presence.docs.map(d=>d.data());
  const live=allDevices.filter(d=>d.lastSeenAt?.toMillis && d.lastSeenAt.toMillis()>=activeSince);
  const modes=['entrenando','competencia','anotador','espectador','inicio'];
  put('wa-now-all',live.length);
  modes.forEach((mode,i)=>put(['wa-now-training','wa-now-competition','wa-now-scorer','wa-now-spectator','wa-now-home'][i],live.filter(x=>x.mode===mode).length));
  const rows=days.docs.map(d=>d.data()).filter(x=>/^\d{8}$/.test(x.day)&&typeof x.uid==='string');
  put('wa-total',allDevices.length);
  const todayStart=new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z').getTime();
  put('wa-new',allDevices.filter(x=>x.createdAt?.toMillis&&x.createdAt.toMillis()>=todayStart).length);
  const last=allDevices.map(x=>x.lastSeenAt?.toMillis?.()||0).reduce((a,b)=>Math.max(a,b),0);
  put('wa-last-activity',last?new Date(last).toLocaleString('es-CL'):'—');
  const list=$('wa-daily-list');list.replaceChildren();
  for(let i=6;i>=0;i--){const day=dateDaysAgo(i);const li=document.createElement('li');const dt=document.createElement('span');dt.textContent=day.slice(6,8)+'/'+day.slice(4,6);
   const n=document.createElement('strong');n.textContent=String(new Set(rows.filter(x=>x.day===day).map(x=>x.uid)).size);li.append(dt,n);list.append(li);}
  const unique=entries=>new Set(entries.map(x=>x.uid)).size;
  const counts=new Map();
  for(const x of rows){const set=counts.get(x.uid)||new Set();set.add(x.day);counts.set(x.uid,set);}
  put('wa-day',unique(rows.filter(x=>x.day===today)));
  put('wa-week',unique(rows.filter(x=>x.day>=since7)));
  put('wa-month',unique(rows));
  put('wa-return',[...counts.values()].filter(x=>x.size>1).length);
  put('wa-training-month',unique(rows.filter(x=>x.entrenando===true)));
  put('wa-competition-month',unique(rows.filter(x=>x.competencia===true||x.anotador===true)));
  $('wa-admin-refreshed').textContent=new Date().toLocaleTimeString('es-CL');
  $('wa-admin-data').hidden=false;state('Lectura segura autorizada. Actualiza automáticamente cada minuto.');
 }catch(err){state('No se pudieron consultar los datos. Comprueba las reglas Firestore: '+err.message,true);}
 finally{busy=false;}
}
async function start(){
 try{
  const cloud=await import('./cloud.js?v=0.6.4.18');await cloud.initialize();uid=cloud.currentUid();
  if(!uid)throw Error('No hay usuario anónimo de Firebase.');
  db=getFirestore(getApp());
  const grant=await getDoc(doc(db,'waUsageAdmins',uid));
  if(!grant.exists()){
   state('Acceso restringido. Todavía no se ha autorizado este dispositivo como administrador.');
   const box=document.createElement('div');box.className='gap';
   const label=document.createElement('p');label.textContent='Tu UID de Firebase (cópialo dentro del mismo dispositivo desde el que abrirás este panel):';
   const code=document.createElement('code');code.textContent=uid;code.className='admin-code';
   const note=document.createElement('p');note.textContent='En Firebase Console → Firestore Database → Datos, crea una colección waUsageAdmins y un documento cuyo ID sea exactamente este UID. No agregues el UID a la página web ni al código fuente. Las reglas impiden que alguien se otorgue el permiso desde la aplicación.';
   const retry=document.createElement('button');retry.className='btn block';retry.textContent='Volver a comprobar acceso';retry.addEventListener('click',()=>location.reload());
   box.append(label,code,note,retry);$('wa-admin-state').append(box);return;
  }
  authorized=true;await refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh();},60000);
 }catch(err){state('No se pudo verificar el acceso. Conexión o configuración incompleta: '+err.message,true);}
}
$('wa-admin-reload').addEventListener('click',refresh);
start();
