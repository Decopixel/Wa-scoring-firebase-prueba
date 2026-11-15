/* WA Scoring v0.6.4.22 — PDF sin dependencias: A4 apaisado, WinAnsiEncoding. */
(function(global){
 'use strict';
 const PT=842,PH=595,ROWS_PER_PAGE=17;
 const cp1252={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
 function enc(s){return Array.from(String(s??'')).map(ch=>{if(ch==='\\')return '\\\\';if(ch==='(')return '\\(';if(ch===')')return '\\)';const cp=ch.codePointAt(0);if(cp>=32&&cp<=126)return ch;const v=cp1252[ch]??(cp>=160&&cp<=255?cp:null);return v==null?'?':'\\'+v.toString(8).padStart(3,'0')}).join('')}
 function visible(s){return Array.from(String(s??'')).map(ch=>{const cp=ch.codePointAt(0);return cp1252[ch]!=null||(cp>=32&&cp<=126)||(cp>=160&&cp<=255)?ch:'?'}).join('')}
 function fit(s,width,size=9){const letters=Array.from(visible(s));const max=Math.max(2,Math.floor(width/(size*.52)));return letters.length>max?letters.slice(0,max-1).join('').trimEnd()+'…':letters.join('')}
 function safeFile(s){return String(s||'competencia').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,62)||'competencia'}
 function normalizeClub(s){return String(s||'').trim()||'Sin club informado'}
 function participant(ev,number){return (ev.entries||[]).find(a=>a.number===number&&!a.vacant)}
 function rowsFor(ev,club){return (ev.draw||[]).map(d=>({target:d.target,position:d.position,number:d.number,archer:participant(ev,d.number)})).filter(r=>r.archer&&(!club||normalizeClub(r.archer.club)===club)).sort((a,b)=>a.target-b.target||a.position.localeCompare(b.position))}
 function pdfDate(raw){return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw.slice(8,10)+'-'+raw.slice(5,7)+'-'+raw.slice(0,4):String(raw||'')}
 function buildPage(ev,club,items,page,totalPages,totalRows){
  const out=[];
  const write=(x,y,size,str,bold=false,color='0.13 0.18 0.27')=>out.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+color+' rg 1 0 0 1 '+x+' '+y+' Tm ('+enc(str)+') Tj ET');
  const line=(x1,y1,x2,y2,color='.82 .86 .91')=>out.push(color+' RG .6 w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
  const rect=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
  rect(0,PH-12,PT,12,'.08 .47 .81');
  write(40,548,11,'WA SCORING  /  ORGANIZACIÓN DE COMPETENCIAS',true,'.08 .47 .81');
  write(40,510,21,'LISTADO DE ASIGNACIÓN DE PARAPETOS',true);
  write(40,482,12,fit(ev.name,700,12),true);
  write(40,460,9,'Fecha: '+pdfDate(ev.date)+'   |   Estado: Sorteo confirmado   |   Participantes en este listado: '+totalRows);
  write(40,441,9,club?'Club: '+fit(club,620):'Todos los clubes e independientes');
  const columns=[{x:42,w:68,label:'Parapeto'},{x:113,w:44,label:'Pos.'},{x:159,w:50,label:'N°'},{x:212,w:206,label:'Arquero'},{x:420,w:181,label:'Club / institución'},{x:604,w:196,label:'División / categoría'}];
  rect(40,411,762,24,'.09 .24 .42');
  for(const col of columns)write(col.x,420,8.5,col.label,true,'1 1 1');
  items.forEach((r,i)=>{
   const y=389-18*i;
   if(i%2===0)rect(40,y-6,762,18,'.95 .97 .99');
   if(i>0&&items[i-1].target!==r.target)line(40,y+12,802,y+12,'.45 .64 .84');
   write(46,y,9,String(r.target),true);
   write(120,y,9,r.position,true);
   write(165,y,9,String(r.number));
   write(212,y,9,fit(r.archer.name,194));
   write(420,y,9,fit(normalizeClub(r.archer.club),172));
   write(604,y,8.5,fit([r.archer.division,r.archer.age].filter(Boolean).join(' · '),186,8.5));
  });
  line(40,66,802,66);
  write(40,50,8,'Listado informativo para comunicar posiciones. Las correcciones deben verificarse con la organización.');
  write(722,50,8,'Página '+page+' / '+totalPages);
  return out.join('\n')+'\n';
 }
 function toPdf(pages,options={}){
  const width=options.width||PT,height=options.height||PH,images=options.images||[];
  const objects={};const fontId=3+pages.length*2;
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]='<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*2)+' 0 R').join(' ')+'] >>';
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontId+1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((content,i)=>{
   const pageId=3+i*2,streamId=4+i*2;
   objects[pageId]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+width+' '+height+'] /Resources << /Font << /F1 '+fontId+' 0 R /F2 '+(fontId+1)+' 0 R >>'+(images.length?' /XObject << '+images.map((_,j)=>'/Im'+j+' '+(fontId+2+j)+' 0 R').join(' ')+' >>':'')+' >> /Contents '+streamId+' 0 R >>';
   objects[streamId]='<< /Length '+content.length+' >>\nstream\n'+content+'endstream';
  });
  images.forEach((img,j)=>{
   const stream=img.hex+'>\n';
   objects[fontId+2+j]='<< /Type /XObject /Subtype /Image /Width '+img.width+' /Height '+img.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length '+stream.length+' >>\nstream\n'+stream+'endstream';
  });
  const size=fontId+2+images.length;
  const ids=Object.keys(objects).map(Number).sort((a,b)=>a-b);
  let result='%PDF-1.4\n%WA Scoring\n';const offsets=[0];
  for(const id of ids){offsets[id]=result.length;result+=id+' 0 obj\n'+objects[id]+'\nendobj\n'}
  const xref=result.length;
  result+='xref\n0 '+size+'\n0000000000 65535 f \n';
  for(let i=1;i<size;i++)result+=(String(offsets[i]||0).padStart(10,'0')+' 00000 n \n');
  result+='trailer\n<< /Size '+size+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  const bytes=new Uint8Array(result.length);for(let i=0;i<result.length;i++)bytes[i]=result.charCodeAt(i)&255;
  return new Blob([bytes],{type:'application/pdf'});
 }
 function generate(ev,club=''){
  if(!ev||!ev.locked||!(ev.draw||[]).length)throw Error('Confirma el sorteo antes de generar el PDF.');
  const rows=rowsFor(ev,club);
  if(!rows.length)throw Error('No hay arqueros para este club.');
  const totalPages=Math.ceil(rows.length/ROWS_PER_PAGE);
  const pages=Array.from({length:totalPages},(_,i)=>buildPage(ev,club,rows.slice(i*ROWS_PER_PAGE,(i+1)*ROWS_PER_PAGE),i+1,totalPages,rows.length));
  const filename='WA_SCORING_Posiciones_'+safeFile(ev.name)+(club?'_'+safeFile(club):'_Todos')+'.pdf';
  return {blob:toPdf(pages),filename,count:rows.length,pages:totalPages};
 }
 // Convert each stored PNG signature to an opaque RGB JPEG. Never print before it has loaded.
 async function signatureImage(data){
  if(typeof data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>250000)throw Error('Firma de la planilla inválida.');
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo leer una de las firmas.'));img.src=data;});
  if(!image.naturalWidth||!image.naturalHeight)throw Error('Firma sin dimensiones.');
  const canvas=document.createElement('canvas'),scale=Math.min(1,800/image.naturalWidth,250/image.naturalHeight);
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo preparar la imagen de firma.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const jpeg=canvas.toDataURL('image/jpeg',.92);if(!jpeg.startsWith('data:image/jpeg;base64,'))throw Error('No se pudo convertir la firma.');
  const raw=atob(jpeg.split(',')[1]);let hex='';for(let i=0;i<raw.length;i++)hex+=raw.charCodeAt(i).toString(16).padStart(2,'0');
  return {width:canvas.width,height:canvas.height,hex};
 }
 function signedPage(ev,slot,r,f,images){
  const a=participant(ev,slot.number),v=r.validation;const out=[];
  const write=(x,y,size,str,bold=false,color='.13 .18 .22')=>out.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+color+' rg 1 0 0 1 '+x+' '+y+' Tm ('+enc(str)+') Tj ET');
  const rect=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
  const line=(x1,y1,x2,y2)=>out.push('.78 .82 .80 RG .5 w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
  const score=shot=>shot.score==='M'?0:shot.score;
  const total=r.ends.flat().reduce((n,shot)=>n+score(shot),0);
  rect(0,830,595,12,'.12 .42 .24');
  write(36,800,10,'WA SCORING  /  COMPETENCIAS',true,'.12 .42 .24');
  write(36,771,20,'PLANILLA FIRMADA Y VALIDADA',true);
  write(36,747,12,fit(ev.name,520,12),true);
  write(36,727,10,'Fecha: '+pdfDate(ev.date)+'  |  '+fit(f.name,340,10));
  write(36,708,11,fit(a.name,370,11),true);write(405,708,10,'N° '+slot.number+'  |  Paca '+slot.target+slot.position,true);
  write(36,690,9,fit([normalizeClub(a.club),a.division,a.age,a.level,a.gender].filter(Boolean).join(' / '),520,9));
  write(36,668,13,total+' / '+(f.perEnd*f.maxEnds*10)+' puntos  ·  '+(f.perEnd*f.maxEnds)+' flechas',true,'.12 .42 .24');
  const start=36,end=559, widths=[55,...Array(f.perEnd).fill((523-55-130)/f.perEnd),65,65]; const xs=[start];widths.forEach(w=>xs.push(xs.at(-1)+w));
  rect(start,628,end-start,24,'.12 .36 .23');const heads=['Tanda',...Array.from({length:f.perEnd},(_,i)=>'F'+(i+1)),'Subtotal','Total'];heads.forEach((h,i)=>write(xs[i]+7,636,9,h,true,'1 1 1'));
  let running=0;r.ends.forEach((shots,i)=>{const y=610-i*18;const sorted=[...shots].sort((a,b)=>score(b)-score(a)||Number(b.xRing)-Number(a.xRing));const subtotal=shots.reduce((n,x)=>n+score(x),0);running+=subtotal;if(i%2===0)rect(start,y-6,end-start,18,'.94 .97 .94');[i+1,...sorted.map(x=>x.score==='M'?'M':x.xRing?'X':x.score),subtotal,running].forEach((val,j)=>write(xs[j]+8,y,10,val,j===0||j>=heads.length-2));});
  line(start,252,end,252);
  write(36,230,9,'Validada: '+new Date(v.validatedAt).toLocaleString('es-CL'));
  write(36,207,10,'Firma del arquero',true);write(305,207,10,fit('Firma del anotador: '+(v.scorerName||'Anotador'),250,10),true);
  images.forEach((img,i)=>{const x=i?305:36,y=112,w=254,h=80;rect(x,y,w,h,'.96 .97 .96');const sc=Math.min((w-8)/img.width,(h-8)/img.height),iw=img.width*sc,ih=img.height*sc;out.push('q '+iw.toFixed(2)+' 0 0 '+ih.toFixed(2)+' '+(x+(w-iw)/2).toFixed(2)+' '+(y+(h-ih)/2).toFixed(2)+' cm /Im'+i+' Do Q');});
  write(36,81,9,'Copia de la planilla local validada. Verifique con el organizador si existen revisiones posteriores.');
  write(36,65,8,'Firmas manuscritas registradas en WA Scoring; no constituyen firmas digitales criptográficas.');
  return out.join('\n')+'\n';
 }
 async function signedScorecard(ev,slot,r,f){
  if(!participant(ev,slot.number)||!r||r.status!=='finished'||r.validation?.status!=='validated'||r.validation.decision!=='agree'||!r.validation.validatedAt||!Number.isFinite(new Date(r.validation.validatedAt).getTime())||!Array.isArray(r.ends)||!Array.isArray(r.current)||r.current.length||![3,6].includes(f.perEnd)||![12,20].includes(f.maxEnds)||r.ends.length!==f.maxEnds||r.ends.some(end=>!Array.isArray(end)||end.length!==f.perEnd||end.some(shot=>!shot||!(shot.score==='M'||Number.isInteger(shot.score)&&shot.score>=1&&shot.score<=10))))throw Error('Planilla incompleta o no validada.');
  const images=await Promise.all([signatureImage(r.validation.archerSignature),signatureImage(r.validation.scorerSignature)]);
  const blob=toPdf([signedPage(ev,slot,r,f,images)],{width:595,height:842,images});
  return {blob,filename:'WA_SCORING_Planilla_'+safeFile(ev.name)+'_'+safeFile(participant(ev,slot.number).name)+'_'+slot.number+'.pdf'};
 }
 global.WADrawPDF=Object.freeze({generate,normalizeClub,rowsFor,signedScorecard});
})(window);
