/** WA Scoring — Firebase pilot 0.5.3. Solo datos públicos de configuración; jamás serviceAccount/privateKey. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, onSnapshot, runTransaction, writeBatch, deleteDoc, limit } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const config=window.WA_FIREBASE_CONFIG||{};
export const isConfigured=Boolean(config.apiKey&&config.projectId&&config.appId&&config.authDomain);
let app,auth,db;
const root='waRooms';
const publicRoot='waPublicEvents';
// Firestore no permite arrays anidados directamente (ends = [[flechas], ...]).
// Guardamos cada tanda como un mapa {shots:[...]}; en la app permanecen arrays normales.
// El mismo formato se usa dentro de las revisiones históricas firmadas.
function packEnds(ends){
 if(!Array.isArray(ends))throw Error('Formato de tandas incorrecto: se esperaba una lista.');
 return ends.map(end=>{
  const shots=Array.isArray(end)?end:end?.shots;
  if(!Array.isArray(shots))throw Error('Formato de tanda incompatible: no se envió ninguna flecha.');
  return {shots};
 });
}
function unpackEnds(ends){
 if(!Array.isArray(ends))throw Error('La planilla recibida no contiene una lista de tandas válida.');
 return ends.map(end=>{
  const shots=Array.isArray(end)?end:end?.shots;
  if(!Array.isArray(shots))throw Error('Una tanda recibida de Firebase tiene formato desconocido.');
  return shots;
 });
}
function packRevisions(revisions){
 if(!Array.isArray(revisions))throw Error('Historial de revisiones inválido.');
 return revisions.map(r=>r?.snapshot?{...r,snapshot:{...r.snapshot,ends:packEnds(r.snapshot.ends||[])}}:r);
}
function unpackRevisions(revisions){
 if(!Array.isArray(revisions))throw Error('Historial de revisiones recibido inválido.');
 return revisions.map(r=>r?.snapshot?{...r,snapshot:{...r.snapshot,ends:unpackEnds(r.snapshot.ends||[])}}:r);
}
function toFirestoreCard(card){
 return {...card,ends:packEnds(card.ends||[]),revisions:packRevisions(card.revisions||[])};
}
function fromFirestoreCard(card){
 return {...card,ends:unpackEnds(card.ends||[]),revisions:unpackRevisions(card.revisions||[])};
}

function assertReady(){if(!db||!auth?.currentUser)throw Error('Firebase no está conectado. Comprueba internet y configuración.');}
export function currentUid(){return auth?.currentUser?.uid||null}
export async function initialize(){
 if(!isConfigured)throw Error('Falta configurar firebase-config.js (consulta INSTALACION_FIREBASE.md).');
 if(db)return currentUid();
 app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);
 const existing=await new Promise((resolve,reject)=>{let off=()=>{};off=onAuthStateChanged(auth,u=>{off();resolve(u)},reject)});
 if(!existing)await signInAnonymously(auth);
 return currentUid();
}
export async function publish(ev){
 assertReady();if(ev.status!=='setup'||ev.annotationMode!=='cloud'||!ev.locked||!ev.draw?.length)throw Error('Confirma el sorteo y elige Firebase antes de publicar.');
 if(ev.draw.length>180)throw Error('Piloto limitado a 180 arqueros por competencia; se ampliará tras las pruebas.');
 const ref=doc(collection(db,root));const roomId=ref.id;
 const metadata={ownerUid:currentUid(),sourceEventId:ev.id,name:ev.name,date:ev.date,formatId:ev.formatId,entries:ev.entries,draw:ev.draw,scorers:ev.scorers||[],targets:[...new Set(ev.draw.map(x=>x.target))],preferLeft:!!ev.preferLeft,locked:true,status:'publishing',schemaVersion:1,createdAt:new Date().toISOString()};
 if(JSON.stringify(metadata).length>550000)throw Error('La lista de inscripción supera el límite del piloto.');
 await setDoc(ref,metadata);
 // Cada planilla es un documento independiente: no hay escritura del evento completo al anotar.
 const chunks=[];let batch=writeBatch(db),n=0;
 for(const slot of ev.draw){
  const key=String(slot.number),r=ev.results?.[key]||{ends:[],current:[],status:'active'};
  const card={number:slot.number,target:slot.target,position:slot.position,revision:0,ends:r.ends||[],current:r.current||[],status:r.status||'active',validation:r.validation||{status:'pending',decision:null,archerSignature:null,scorerSignature:null},revisions:r.revisions||[],lastWriterUid:currentUid(),updatedAt:new Date().toISOString()};
  if(JSON.stringify(card).length>850000)throw Error(`La planilla ${slot.number} es demasiado grande para Firestore; no se puede publicar.`);
  batch.set(doc(ref,'cards',key),toFirestoreCard(card));n++;if(n===350){chunks.push(batch);batch=writeBatch(db);n=0}
 }
 if(n)chunks.push(batch);
 for(const b of chunks)await b.commit();
 await updateDoc(ref,{status:'waiting'});
 return roomId;
}
export async function requestJoin(roomId,target,name){
 assertReady();if(!/^[\w-]{20,24}$/.test(roomId))throw Error('El código de sala no tiene el formato esperado.');
 if(!Number.isInteger(target)||target<1||target>500)throw Error('Parapeto incorrecto.');
 if(name.trim().length<3||name.trim().length>90)throw Error('Escribe tu nombre (3 a 90 caracteres).');
 const self=doc(db,root,roomId,'requests',currentUid());
 await setDoc(self,{uid:currentUid(),target,name:name.trim(),requestedAt:new Date().toISOString()});
}
export function watchAdmission(roomId,accept,reject){
 assertReady();return onSnapshot(doc(db,root,roomId,'members',currentUid()),snap=>{
  if(snap.exists())accept(snap.data());
 },reject);
}
export function watchRoom(roomId,target,organizer,{onRoom,onCards,onRequests,onMembers,onBrackets,onError}){
 assertReady();const stops=[];const ref=doc(db,root,roomId);
 stops.push(onSnapshot(ref,s=>{if(!s.exists())return onError(Error('La sala ya no existe'));onRoom(s.data());},onError));
 const cards=collection(ref,'cards');
 stops.push(onSnapshot(organizer?cards:query(cards,where('target','==',target)),snap=>{
  const rows=[];snap.forEach(x=>rows.push([x.id,fromFirestoreCard(x.data())]));onCards(rows,snap.metadata.fromCache);
 },onError));
 if(organizer)stops.push(onSnapshot(collection(ref,'eliminations'),snap=>{const groups={};snap.forEach(x=>groups[x.id]=x.data());onBrackets(groups);},onError));
 if(organizer)stops.push(onSnapshot(collection(ref,'members'),snap=>{
   const members=[];snap.forEach(x=>members.push({uid:x.id,...x.data()}));onMembers(members);
  },onError));
 if(organizer)stops.push(onSnapshot(collection(ref,'requests'),snap=>{
  const requests=[];snap.forEach(x=>requests.push({uid:x.id,...x.data()}));onRequests(requests);
 },onError));
 return ()=>stops.forEach(stop=>stop());
}
export async function approve(roomId,uid,target){
 assertReady();if(!/^[\w-]{20,24}$/.test(roomId)||!uid||!Number.isInteger(target)||target<1||target>500)throw Error('Autorización incorrecta');
 const reqSnap=await getDoc(doc(db,root,roomId,'requests',uid));
 if(!reqSnap.exists()||reqSnap.data().target!==target)throw Error('La solicitud cambió; actualiza la pantalla.');
 const roomSnap=await getDoc(doc(db,root,roomId));
 if(roomSnap.data()?.ownerUid!==currentUid()||!roomSnap.data().targets.includes(target))throw Error('Sin autorización para asignar este parapeto');
 await setDoc(doc(db,root,roomId,'members',uid),{uid,role:'scorer',target,name:reqSnap.data().name,approvedAt:new Date().toISOString()});
 await deleteDoc(doc(db,root,roomId,'requests',uid));
}
export async function startRoom(roomId,requiredTargets){
 assertReady();const ref=doc(db,root,roomId);
 const snapshot=await getDocs(collection(ref,'members'));
 const approved=new Set(snapshot.docs.filter(x=>x.data().role==='scorer').map(x=>Number(x.data().target)));
 if(!Array.isArray(requiredTargets)||!requiredTargets.length||!requiredTargets.every(t=>approved.has(t)))
  throw Error('Hay parapetos sin anotador aprobado. No se inició la competencia.');
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists()||snap.data().ownerUid!==currentUid()||snap.data().status!=='waiting')throw Error('La sala no está esperando el inicio o no eres el organizador.');
  tx.update(ref,{status:'running'});
 });
}
export async function updateCard(roomId,number,expectedRevision,nextResult){
 assertReady();const ref=doc(db,root,roomId,'cards',String(number));
 const result=structuredClone(nextResult);
 const publicRef=doc(db,publicRoot,roomId),publicCardRef=doc(publicRef,'scores',String(number));
 if(JSON.stringify(result).length>800000)throw Error('La planilla supera el tamaño permitido por Firestore. Exporta un respaldo y consulta al organizador.');
 return runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  const published=await tx.get(publicRef);
  if(!snap.exists())throw Error('Planilla no encontrada en el servidor');
  const previous=snap.data();
  if(previous.revision!==expectedRevision)throw Error('CONFLICTO: la planilla cambió en otro teléfono. Se mostrará la versión más reciente; verifica antes de repetir el toque.');
  const card={...previous,ends:result.ends,current:result.current,status:result.status,validation:result.validation||{status:'pending',decision:null,archerSignature:null,scorerSignature:null},revisions:result.revisions||[],revision:previous.revision+1,lastWriterUid:currentUid(),updatedAt:new Date().toISOString()};
  tx.update(ref,toFirestoreCard(card));
  if(published.exists())tx.set(publicCardRef,publicScore(card));
  return card;
 });
}

// Eliminatorias: SOLO el organizador modifica una llave y solo con revisión confirmada.
// Los enfrentamientos se escriben en una colección independiente; no tocan planillas firmadas.
export async function saveElimination(roomId,key,group,expectedRevision){
 assertReady();if(!/^g_[A-Za-z0-9_.~-]+$/.test(key)||key.length>300)throw Error('Identificador de llave incorrecto.');
 const ref=doc(db,root,roomId,'eliminations',key),publicRef=doc(db,publicRoot,roomId),publicBracket=doc(publicRef,'eliminations',key);
 return runTransaction(db,async tx=>{
  const roomSnap=await tx.get(doc(db,root,roomId)),old=await tx.get(ref),published=await tx.get(publicRef);
  if(!roomSnap.exists()||roomSnap.data().ownerUid!==currentUid()||roomSnap.data().status!=='running')throw Error('Solo el organizador con la competencia iniciada puede editar llaves.');
  const prior=old.exists()?old.data().revision:-1;
  if(prior!==expectedRevision)throw Error('CONFLICTO: la llave fue modificada en otro dispositivo. Revisa la versión más reciente antes de continuar.');
  const data={category:group.category,size:group.size,mode:group.mode,seeds:group.seeds,qualification:group.qualification,matches:group.matches,bronze:group.bronze,
    createdAt:old.exists()?old.data().createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:prior+1};
  if(JSON.stringify(data).length>180000)throw Error('Llave supera el tamaño seguro del piloto.');
  tx.set(ref,data);if(published.exists())tx.set(publicBracket,data);
  return data;
 });
}
// Público: nombre/categoría y resumen para clasificación. Las coordenadas se liberan SOLO tras validación.
function tally(shots){return shots.reduce((n,s)=>n+(s.score==='M'?0:Number(s.score)||0),0);}
function publicScore(card){
 const full=(card.ends||[]).flat().concat(card.current||[]);
 const validated=card.status==='finished'&&card.validation?.status==='validated';
 return {number:card.number,target:card.target,position:card.position,
  points:tally(full),arrows:full.length,complete:card.status==='finished',validated,
  revision:card.revision,updatedAt:card.updatedAt,
  detailedEnds:validated?packEnds(card.ends||[]):[],
  };
}
function safePublicParticipants(ev){
 return (ev.draw||[]).map(d=>{
  const a=ev.entries.find(x=>x.number===d.number&&!x.vacant);
  if(!a)return null;
  return {number:d.number,name:a.name,division:a.division,age:a.age,level:a.level,
    gender:a.gender,target:d.target,position:d.position};
 }).filter(Boolean);
}
// El organizador decide expresamente cuándo publicar. No se añaden firmas ni UID de anotadores.
export async function publishSpectatorEvent(ev,cards){
 assertReady();
 if(!ev?.cloudRoomId||ev.cloudRole!=='organizer')throw Error('Solo el organizador puede compartir resultados.');
 const roomRef=doc(db,root,ev.cloudRoomId),snap=await getDoc(roomRef);
 if(!snap.exists()||snap.data().ownerUid!==currentUid()||snap.data().status!=='running')
  throw Error('Es necesario iniciar la competencia y conectarse como organizador.');
 if(!Array.isArray(cards)||cards.length!==(ev.draw||[]).length)
  throw Error('Todavía no se han sincronizado todas las planillas. Espera y vuelve a intentar.');
 const ref=doc(db,publicRoot,ev.cloudRoomId),already=await getDoc(ref),now=new Date().toISOString();
 const info={roomId:ev.cloudRoomId,name:ev.name,date:ev.date,
  formatId:ev.formatId,enabled:true,status:'running',schemaVersion:1,updatedAt:now,
  createdAt:already.exists()?already.data().createdAt:now,participants:safePublicParticipants(ev)};
 if(!already.exists())await setDoc(ref,info);
 else await updateDoc(ref,{enabled:true,updatedAt:now});
 // No sobrescribir revisiones nuevas: los datos vienen del observador confirmado del servidor.
 // Reglas Firestore: máximo de lecturas de documentos en una escritura por lote.
 // Cada puntuación consulta su planilla original; limitamos el lote a 8 tarjetas.
 for(let i=0;i<cards.length;i+=8){
  const batch=writeBatch(db);
  for(const [key,card] of cards.slice(i,i+8))batch.set(doc(ref,'scores',String(key)),publicScore(card));
  await batch.commit();
 }
 // Copia pública de las llaves existentes. No contiene firmas ni identificadores de cuentas.
 const existingBrackets=await getDocs(collection(roomRef,'eliminations'));
 for(const d of existingBrackets.docs)await setDoc(doc(ref,'eliminations',d.id),d.data());
 return ev.cloudRoomId;
}
export async function setSpectatorVisibility(roomId,enabled){
 assertReady();
 await updateDoc(doc(db,publicRoot,roomId),{enabled:!!enabled,updatedAt:new Date().toISOString()});
}
export function watchSpectatorSettings(roomId,onChange,onError){
 assertReady();return onSnapshot(doc(db,publicRoot,roomId),snap=>onChange(snap.exists()?snap.data():null),onError);
}
export function watchPublicDirectory(onChange,onError){
 assertReady();return onSnapshot(query(collection(db,publicRoot),where('enabled','==',true),limit(30)),snap=>{
  onChange(snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
 },onError);
}
export function watchPublicEvent(roomId,{onRoom,onScores,onBrackets,onError}){
 assertReady();if(!/^[\w-]{20,24}$/.test(roomId))throw Error('Enlace público incorrecto.');
 const ref=doc(db,publicRoot,roomId);
 const a=onSnapshot(ref,snap=>{
  if(!snap.exists()||snap.data().enabled!==true)onError(Error('Esta competencia no está disponible para espectadores.'));
  else onRoom({id:snap.id,...snap.data()});
 },onError);
 const b=onSnapshot(collection(ref,'scores'),snap=>onScores(snap.docs.map(x=>x.data())),onError);
 const c=onSnapshot(collection(ref,'eliminations'),snap=>onBrackets(snap.docs.map(x=>x.data())),onError);
 return ()=>{a();b();c()};
}
