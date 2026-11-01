/** WA Scoring — Firebase pilot 0.5.0. Solo datos públicos de configuración; jamás serviceAccount/privateKey. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, updateDoc, getDoc, query, where, onSnapshot, runTransaction, writeBatch, deleteDoc } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const config=window.WA_FIREBASE_CONFIG||{};
export const isConfigured=Boolean(config.apiKey&&config.projectId&&config.appId&&config.authDomain);
let app,auth,db;
const root='waRooms';
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
 assertReady();if(ev.status!=='running'||!ev.locked||!ev.draw?.length)throw Error('Inicia y confirma el sorteo antes de publicar.');
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
 await updateDoc(ref,{status:'running'});
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
export function watchRoom(roomId,target,organizer,{onRoom,onCards,onRequests,onError}){
 assertReady();const stops=[];const ref=doc(db,root,roomId);
 stops.push(onSnapshot(ref,s=>{if(!s.exists())return onError(Error('La sala ya no existe'));onRoom(s.data());},onError));
 const cards=collection(ref,'cards');
 stops.push(onSnapshot(organizer?cards:query(cards,where('target','==',target)),snap=>{
  const rows=[];snap.forEach(x=>rows.push([x.id,fromFirestoreCard(x.data())]));onCards(rows,snap.metadata.fromCache);
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
 await setDoc(doc(db,root,roomId,'members',uid),{uid,role:'scorer',target,approvedAt:new Date().toISOString()});
 await deleteDoc(doc(db,root,roomId,'requests',uid));
}
export async function updateCard(roomId,number,expectedRevision,nextResult){
 assertReady();const ref=doc(db,root,roomId,'cards',String(number));
 const result=structuredClone(nextResult);
 if(JSON.stringify(result).length>800000)throw Error('La planilla supera el tamaño permitido por Firestore. Exporta un respaldo y consulta al organizador.');
 return runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists())throw Error('Planilla no encontrada en el servidor');
  const previous=snap.data();
  if(previous.revision!==expectedRevision)throw Error('CONFLICTO: la planilla cambió en otro teléfono. Se mostrará la versión más reciente; verifica antes de repetir el toque.');
  const card={...previous,ends:result.ends,current:result.current,status:result.status,validation:result.validation||{status:'pending',decision:null,archerSignature:null,scorerSignature:null},revisions:result.revisions||[],revision:previous.revision+1,lastWriterUid:currentUid(),updatedAt:new Date().toISOString()};
  tx.update(ref,toFirestoreCard(card));
  return card;
 });
}
