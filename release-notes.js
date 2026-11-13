/* WA Scoring 0.6.4.22 — registro de novedades. No usa Firebase ni IndexedDB. */
(() => {
 'use strict';
 // Actualizar estos datos en CADA próxima versión que tenga novedades visibles.
 const RELEASE = Object.freeze({
  version:'0.6.4.22',
  changes:[
   'Nuevo campo Club / institución al inscribir arqueros; permite indicar Independiente.',
   'Después de confirmar el sorteo, PDF de posiciones completo o por club para compartir con las delegaciones.',
   'Se mantiene la recepción de entrenamientos por WhatsApp mediante el portapapeles, evitando confundir Chrome/Safari con la app instalada.'
  ]
 });
 const KEY='wa-scoring-changelog-ack-v1';
 const WELCOME_KEY='wa-scoring-welcome-seen-v1';
 const ARCHER_KEY='wa-scoring-training-last-archer-v2';
 let pending=false, initialized=false, overlay=null, previousFocus=null;
 const byId=id=>document.getElementById(id);
 function cmpVersions(a,b){
  const aa=String(a).split('.').map(Number),bb=String(b).split('.').map(Number);
  if(aa.some(v=>!Number.isInteger(v))||bb.some(v=>!Number.isInteger(v)))return -1;
  for(let i=0;i<Math.max(aa.length,bb.length);i++){
   if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)>(bb[i]||0)?1:-1;
  }
  return 0;
 }
 function init({hasExistingData=false}={}){
  if(initialized)return;initialized=true;
  try{
   const last=localStorage.getItem(KEY)||'';
   const existing=Boolean(last||localStorage.getItem(WELCOME_KEY)==='1'||localStorage.getItem(ARCHER_KEY)||hasExistingData);
   if(!existing){
    // Primera instalación: mostrar bienvenida, pero NO confundirla con actualización.
    localStorage.setItem(KEY,RELEASE.version);
    return;
   }
   // Si es una actualización sobre una versión antigua que no registraba novedades,
   // se muestra el aviso una vez; en futuras versiones se compara la marca guardada.
   pending=!last||cmpVersions(last,RELEASE.version)<0;
  }catch(_){pending=false;} // Sin almacenamiento fiable, no disparar aviso repetidamente.
 }
 function safe(force){
  if(!force && document.body.dataset.waPage!=='home')return false;
  return typeof window.WAUpdateMayApply==='function' && window.WAUpdateMayApply()===true;
 }
 function close(acknowledge){
  if(!overlay)return;
  overlay.remove();overlay=null;
  document.body.classList.remove('wa-release-open');
  const root=byId('app');if(root)root.inert=false;
  if(acknowledge){
   pending=false;
   try{localStorage.setItem(KEY,RELEASE.version);}catch(_){/* Sin persistencia: no afecta datos. */}
  }
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  previousFocus=null;
  window.WAUpdates?.refresh();
 }
 function show(force=false){
  if(!initialized||overlay||!safe(force)||(!force&&!pending))return false;
  previousFocus=document.activeElement;
  const wrapper=document.createElement('div');
  wrapper.id='wa-release-overlay';wrapper.className='wa-release-overlay';wrapper.dataset.manual=force?'1':'';
  const box=document.createElement('section');
  box.className='wa-release-dialog';box.setAttribute('role','dialog');
  box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','wa-release-title');
  box.tabIndex=-1;
  const icon=document.createElement('div');icon.textContent='🎁  ¡WA Scoring se actualizó!';icon.className='wa-release-intro';
  const title=document.createElement('h2');title.id='wa-release-title';title.textContent='Novedades de WA Scoring';
  const version=document.createElement('span');version.className='wa-release-version';version.textContent='Versión '+RELEASE.version;
  const list=document.createElement('ol');list.className='wa-release-list';
  for(const change of RELEASE.changes){const li=document.createElement('li');li.textContent=change;list.appendChild(li);}
  const note=document.createElement('p');note.className='wa-release-caption';note.textContent='Tus entrenamientos y resultados guardados se mantienen. El aviso no elimina ni modifica registros.';
  const btn=document.createElement('button');btn.type='button';btn.id='wa-release-ok';btn.className='btn primary wa-release-ok';btn.textContent='¡Entendido! Continuar';
  btn.addEventListener('click',()=>close(true));
  box.append(icon,title,version,list,note,btn);wrapper.appendChild(box);
  document.body.appendChild(wrapper);overlay=wrapper;
  document.body.classList.add('wa-release-open');
  const root=byId('app');if(root)root.inert=true;
  box.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();btn.focus();}
   if(event.key==='Tab'){event.preventDefault();btn.focus();}
  });
  btn.focus({preventScroll:true});
  window.WAUpdates?.refresh();
  return true;
 }
 function refresh(){
  if(!initialized)return;
  if(overlay){
   // Si comienza alguna actividad mientras está visible, esperar de nuevo en inicio.
   if(document.body.dataset.waPage!=='home' && !overlay.dataset.manual)close(false);
   return;
  }
  if(pending)safe(false)&&show(false);
 }
 window.WAReleaseNotes={init,refresh,show};
})();
