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
 function toPdf(pages){
  const objects={};const fontId=3+pages.length*2;
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]='<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*2)+' 0 R').join(' ')+'] >>';
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontId+1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((content,i)=>{
   const pageId=3+i*2,streamId=4+i*2;
   objects[pageId]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PT+' '+PH+'] /Resources << /Font << /F1 '+fontId+' 0 R /F2 '+(fontId+1)+' 0 R >> >> /Contents '+streamId+' 0 R >>';
   objects[streamId]='<< /Length '+content.length+' >>\nstream\n'+content+'endstream';
  });
  const ids=Object.keys(objects).map(Number).sort((a,b)=>a-b);
  let result='%PDF-1.4\n%WA Scoring\n';const offsets=[0];
  for(const id of ids){offsets[id]=result.length;result+=id+' 0 obj\n'+objects[id]+'\nendobj\n'}
  const xref=result.length;
  result+='xref\n0 '+(fontId+2)+'\n0000000000 65535 f \n';
  for(let i=1;i<=fontId+1;i++)result+=(String(offsets[i]||0).padStart(10,'0')+' 00000 n \n');
  result+='trailer\n<< /Size '+(fontId+2)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
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
 global.WADrawPDF=Object.freeze({generate,normalizeClub,rowsFor});
})(window);
