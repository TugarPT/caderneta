/* ---------- sincronizar aparelhos por QR (Definições → Sincronizar) ----------
   Regista quando cada registo muda ou é apagado (localStorage "caderneta.sync"), para juntar sem perder nada:
   ganha a alteração mais recente e os apagados viajam. Antes de juntar guarda um ponto de restauro ("caderneta.preSync"). */
const SY={key:"caderneta.sync",meta:{mod:{},del:{}},quiet:false,B:300,fps:6,enc:null,seq:0,tmr:0,stream:null,det:null,dec:null,run:false,inc:null,lock:null,
  load(){try{const m=JSON.parse(localStorage.getItem(this.key)||"null");if(m&&typeof m==="object")this.meta={mod:m.mod||{},del:SYQ.pruneDel(m.del||{},Date.now(),180)}}catch(e){}},
  save(){try{localStorage.setItem(this.key,JSON.stringify(this.meta))}catch(e){}}};
SY.load();
try{const f=+localStorage.getItem("caderneta.syFps");if([3,6,10].includes(f))SY.fps=f}catch(e){}
/* cada gravação e cada apagar ficam com a hora, para a junção saber o que é mais recente */
(function(pm,dm){
  Store.putMany=function(objs){if(!SY.quiet){const t=Date.now();for(const o of objs){if(!o||!o.id)continue;SY.meta.mod[o.id]=t;delete SY.meta.del[o.id]}SY.save()}return pm.call(this,objs)};
  Store.delMany=function(ids){if(!SY.quiet){const t=Date.now();for(const id of ids){if(!S.items.has(id))continue;SY.meta.del[id]=t;delete SY.meta.mod[id]}SY.save()}return dm.call(this,ids)};
})(Store.putMany,Store.delMany);

const syShow=w=>["sySend","syRecv","syRev","syDone"].forEach(id=>$("#"+id).hidden=id!==w);
async function syWake(on){try{if(on&&!SY.lock&&navigator.wakeLock)SY.lock=await navigator.wakeLock.request("screen");else if(!on&&SY.lock){await SY.lock.release();SY.lock=null}}catch(e){SY.lock=null}}
function syStop(){clearInterval(SY.tmr);SY.tmr=0;SY.run=false;if(SY.stream){SY.stream.getTracks().forEach(t=>t.stop());SY.stream=null}const v=$("#syVid");if(v)v.srcObject=null;syWake(false)}

/* --- o que se envia: todos os registos + as horas das alterações (sem fotos de talões) --- */
function syPayload(){const items=[...S.items.values()],ids=new Set(items.map(o=>o.id)),mod={};
  for(const id in SY.meta.mod)if(ids.has(id))mod[id]=SY.meta.mod[id];
  return{app:"caderneta",t:"sync",v:1,at:new Date().toISOString(),items,meta:{mod,del:SYQ.pruneDel(SY.meta.del,Date.now(),180)}}}
async function syZip(txt){const raw=new TextEncoder().encode(txt);
  if(typeof CompressionStream==="undefined"){const u=new Uint8Array(raw.length+1);u[0]=0;u.set(raw,1);return u}
  const z=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const u=new Uint8Array(z.length+1);u[0]=1;u.set(z,1);return u}
async function syUnzip(u){if(u[0]===0)return new TextDecoder().decode(u.subarray(1));
  if(u[0]!==1||typeof DecompressionStream==="undefined")throw new Error("fmt");
  return new TextDecoder().decode(await new Response(new Blob([u.subarray(1)]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer())}

/* --- enviar: QR animado --- */
function syDraw(txt){const q=qrcode(0,"M");q.addData(txt,"Alphanumeric");q.make();const n=q.getModuleCount(),m=4,c=$("#syQr"),cell=Math.max(4,Math.floor(560/(n+2*m))),W=(n+2*m)*cell;
  if(c.width!==W){c.width=c.height=W}const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,W,W);g.fillStyle="#000";
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))g.fillRect((x+m)*cell,(y+m)*cell,cell,cell)}
function syTick(){if(!SY.enc)return;syDraw(SY.enc.frame(SY.seq++));const K=SY.enc.K;
  $("#syPart").textContent=K===1?"Código único":"Parte "+((SY.seq-1)%K+1)+" de "+K+(Math.floor((SY.seq-1)/K)%2?" · reforço":"")}
function sySpeed(){clearInterval(SY.tmr);if(SY.enc&&SY.enc.K>1)SY.tmr=setInterval(syTick,1000/SY.fps);
  document.querySelectorAll("#sySpeed button").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.fps===SY.fps)));
  if(SY.enc){const s=Math.max(2,Math.ceil(SY.enc.K*1.1/SY.fps));$("#syEta").textContent=SY.enc.K===1?"Basta apontar a câmara.":"Demora cerca de "+(s<90?s+" segundos":Math.round(s/60)+" minutos")+" com a câmara parada."}}
async function syOpenSend(){syStop();SY.inc=null;$("#syTitle").textContent="Enviar para outro aparelho";syShow("sySend");if(!$("#syDlg").open)$("#syDlg").showModal();
  const p=syPayload(),n=p.items.length;$("#syInfo").textContent="A preparar…";$("#syPart").textContent="";$("#syEta").textContent="";
  const rc=p.items.filter(o=>o.kind==="tx"&&o.rcpt).length;$("#syRcNote").hidden=!rc;
  const u=await syZip(JSON.stringify(p));SY.enc=SYQ.Encoder(u,SY.B,(Math.random()*4294967295)>>>0||7);SY.seq=0;SY.sendTxt=JSON.stringify(p);
  $("#syInfo").textContent=`${n} ${n===1?"registo":"registos"} · ${kb(u.length)}`;syTick();sySpeed();syWake(true)}
$("#sySpeed").addEventListener("click",e=>{const b=e.target.closest("button[data-fps]");if(!b)return;SY.fps=+b.dataset.fps;try{localStorage.setItem("caderneta.syFps",SY.fps)}catch(x){}sySpeed()});
/* sem câmara do outro lado: o mesmo conteúdo num ficheiro (partilhar no Android, descarregar no computador) */
$("#syFile").onclick=async()=>{const txt=SY.sendTxt||JSON.stringify(syPayload()),name="caderneta-sync-"+todayISO()+".json",blob=new Blob([txt],{type:"application/json"});
  try{const f=new File([blob],name,{type:"application/json"});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:"Caderneta"});return}}catch(e){if(e&&e.name==="AbortError")return}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);toast("Ficheiro guardado nas transferências")};

/* --- receber: câmara --- */
function syMsg(t,err){const m=$("#syCamMsg");m.textContent=t||"";m.hidden=!t;m.classList.toggle("err",!!err)}
function syProg(){const st=SY.dec&&SY.dec.state,p=st?st.n/st.K:0;$("#syBar").style.width=(p*100).toFixed(1)+"%";$("#syProgBox").setAttribute("aria-valuenow",Math.round(p*100));
  $("#syPct").textContent=!st?"À procura do código…":st.n===st.K?"Recebido. A verificar…":`A receber… ${Math.floor(p*100)}% · ${st.n} de ${st.K} partes`}
async function syOpenRecv(){syStop();SY.inc=null;$("#syTitle").textContent="Receber de outro aparelho";syShow("syRecv");if(!$("#syDlg").open)$("#syDlg").showModal();
  SY.dec=SYQ.Decoder();syProg();syMsg("");$("#syCamSw").hidden=true;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){syMsg("Este navegador não deixa usar a câmara aqui. No outro aparelho, usa “Enviar como ficheiro” e aqui “Abrir ficheiro”.",1);return}
  await syCam()}
async function syCam(dev){const v=$("#syVid");syMsg("A ligar a câmara…");
  try{SY.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:dev?{deviceId:{exact:dev},width:{ideal:1280},height:{ideal:720}}:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}})}
  catch(e){const n=e&&e.name;syMsg(n==="NotAllowedError"||n==="SecurityError"?"A Caderneta não tem autorização para usar a câmara. No Chrome, toca no ícone à esquerda do endereço → Permissões → Câmara → Permitir, e volta a carregar em Receber."
    :n==="NotFoundError"||n==="OverconstrainedError"?"Não encontrei nenhuma câmara neste aparelho. No outro aparelho, usa “Enviar como ficheiro” e aqui “Abrir ficheiro”.":"Não consegui ligar a câmara ("+(n||"erro")+"). Fecha outras apps que a estejam a usar e tenta outra vez.",1);return}
  if(!$("#syDlg").open||$("#syRecv").hidden){syStop();return}
  v.srcObject=SY.stream;try{await v.play()}catch(e){}syMsg("");syWake(true);
  try{const L=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");$("#syCamSw").hidden=L.length<2;SY.cams=L}catch(e){}
  if(SY.det===null||SY.det===undefined){SY.det=false;try{if("BarcodeDetector" in window&&(await BarcodeDetector.getSupportedFormats()).includes("qr_code"))SY.det=new BarcodeDetector({formats:["qr_code"]})}catch(e){}}
  SY.run=true;syLoop()}
$("#syCamSw").onclick=()=>{const L=SY.cams||[];if(L.length<2||!SY.stream)return;const cur=SY.stream.getVideoTracks()[0].getSettings().deviceId,i=L.findIndex(d=>d.deviceId===cur),nx=L[(i+1)%L.length];
  SY.run=false;SY.stream.getTracks().forEach(t=>t.stop());SY.stream=null;syCam(nx.deviceId)};
const syCv=document.createElement("canvas"),syG=syCv.getContext("2d",{willReadFrequently:true});
let syBad=0;
async function syLoop(){if(!SY.run)return;const v=$("#syVid");let txt=null;
  if(v.readyState>=2&&v.videoWidth){
    if(SY.det){try{const r=await SY.det.detect(v);const h=r.find(x=>/^CAD1:/i.test(x.rawValue||""))||r[0];txt=h?h.rawValue:null}catch(e){SY.det=false}}
    else{const w=v.videoWidth,h=v.videoHeight,s=Math.min(w,h),k=Math.min(1,720/s),D=Math.round(s*k);if(syCv.width!==D){syCv.width=syCv.height=D}
      syG.drawImage(v,(w-s)/2,(h-s)/2,s,s,0,0,D,D);const im=syG.getImageData(0,0,D,D),r=jsQR(im.data,D,D,{inversionAttempts:"dontInvert"});txt=r?r.data:null}}
  if(txt){const f=SYQ.parse(txt);if(!f){if(++syBad>8){syMsg("Este código não é da Caderneta. No outro aparelho, carrega em Enviar.");syBad=0}}
    else{syBad=0;syMsg("");const r=SY.dec.add(f);syProg();if(r==="done"){SY.run=false;await syGot()}}}
  if(SY.run)(SY.det?requestAnimationFrame:f=>setTimeout(f,15))(syLoop)}
async function syGot(){const u=SY.dec.result();try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}
  if(!u){syMsg("Os dados chegaram estragados. Vou tentar de novo: continua a apontar a câmara.",1);SY.dec.reset();syProg();SY.run=true;syLoop();return}
  syStop();let j;try{j=JSON.parse(await syUnzip(u))}catch(e){syMsg("Não consegui abrir estes dados. Atualiza a Caderneta nos dois aparelhos e tenta outra vez.",1);return}
  syReview(j)}
$("#syOpen").onclick=()=>$("#syFileIn").click();
$("#syFileIn").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;let j;try{j=JSON.parse(await f.text())}catch(x){toast("Este ficheiro não é da Caderneta");return}syStop();syReview(j)};

/* --- rever e juntar --- */
function syCheck(j){const arr=Array.isArray(j)?j:j&&Array.isArray(j.items)?j.items:null;if(!arr)return null;
  const items=arr.filter(o=>o&&typeof o==="object"&&typeof o.id==="string"&&o.id&&(o.kind||o.id==="settings")).map(o=>o.id==="settings"&&!o.kind?Object.assign({},o,{kind:"settings"}):o);
  const m=j&&j.meta&&typeof j.meta==="object"?j.meta:{},num=x=>{const r={};if(x&&typeof x==="object")for(const k in x)if(isFinite(+x[k]))r[k]=+x[k];return r};
  return{items,meta:{mod:num(m.mod),del:num(m.del)},at:j&&(j.at||j.exportedAt)||"",sync:j&&j.t==="sync"}}
const syN=(n,a,b)=>n+" "+(n===1?a:b);
function syReview(j){const inc=syCheck(j);$("#syTitle").textContent="Juntar os dados";
  if(!inc||!inc.items.length){syShow("syRecv");syMsg("Não encontrei registos da Caderneta nestes dados.",1);return}
  syStop();SY.inc=inc;syShow("syRev");
  $("#syRevHead").textContent=`Chegaram ${syN(inc.items.length,"registo","registos")}`+(inc.at?` (enviados ${agoT(inc.at)})`:"")+". Antes de mudar alguma coisa, vê o que acontece:";
  document.querySelector('input[name="syMode"][value="merge"]').checked=true;syPlanShow()}
function syPlanShow(){const inc=SY.inc;if(!inc)return;const mode=document.querySelector('input[name="syMode"]:checked').value,p=SYQ.plan([...S.items.values()],SY.meta,inc.items,inc.meta,mode);SY.plan=p;
  const L=[[p.add.length,"novo","novos","in"],[p.upd.length,"atualizado","atualizados","acc"],[p.del.length,"apagado","apagados","out"],[p.keep.length,"fica como está (o daqui é mais recente)","ficam como estão (os daqui são mais recentes)",""],[p.same,"já igual","já iguais",""]];
  $("#sySum").innerHTML=L.filter(x=>x[0]).map(x=>`<li class="${x[3]}"><b>${x[0]}</b> ${esc(x[0]===1?x[1]:x[2])}</li>`).join("")||"<li>Nada muda: os dois aparelhos já têm os mesmos dados.</li>";
  const w=$("#syWarn");w.hidden=!(mode==="replace"&&p.del.length);w.textContent=mode==="replace"?`Atenção: ${syN(p.del.length,"registo que só existe neste aparelho vai ser apagado","registos que só existem neste aparelho vão ser apagados")}. Podes desfazer logo a seguir.`:"";
  const ch=p.add.length+p.upd.length+p.del.length;$("#syApply").disabled=!ch;$("#syApply").textContent=!ch?"Nada a mudar":mode==="replace"?"Substituir":"Juntar"}
$("#syRev").addEventListener("change",e=>{if(e.target.name==="syMode")syPlanShow()});
$("#syApply").onclick=()=>{const p=SY.plan,inc=SY.inc;if(!p||!inc)return;
  let saved=true;try{localStorage.setItem("caderneta.preSync",JSON.stringify({at:Date.now(),items:[...S.items.values()],meta:SY.meta}))}catch(e){saved=false;try{localStorage.removeItem("caderneta.preSync")}catch(x){}}
  if(!saved&&!confirm("Não há espaço para guardar um ponto de restauro, por isso não vai dar para desfazer. Continuar?"))return;
  /* direto no mapa (sem apagar fotos de talões), para o "Desfazer" repor tudo como estava */
  for(const id of p.del)S.items.delete(id);for(const o of p.add.concat(p.upd))S.items.set(o.id,o);
  SY.meta=SYQ.mergeMeta(SY.meta,inc.meta,p,Date.now());SY.save();Store.saveLocal();
  try{localStorage.setItem("caderneta.syncAt",new Date().toISOString())}catch(e){}
  render();if(p.add.concat(p.upd).some(o=>o.kind==="inv"))queueSnap();
  const parts=[[p.add.length,"novo","novos"],[p.upd.length,"atualizado","atualizados"],[p.del.length,"apagado","apagados"]].filter(x=>x[0]).map(x=>syN(x[0],x[1],x[2]));
  $("#syDoneMsg").textContent="Pronto: "+parts.join(", ")+".";$("#syUndo").hidden=!saved;$("#syTitle").textContent="Dados juntos";syShow("syDone");SY.inc=null;syCard();
  toast("Dados sincronizados")};
function syUndo(){let s;try{s=JSON.parse(localStorage.getItem("caderneta.preSync")||"null")}catch(e){}if(!s||!Array.isArray(s.items)){toast("Não há nada para desfazer");return}
  if(!confirm("Repor os dados como estavam antes da última sincronização ("+agoT(new Date(s.at).toISOString())+")?"))return;
  S.items=new Map(s.items.map(o=>[o.id,o]));SY.meta=s.meta||{mod:{},del:{}};SY.save();Store.saveLocal();
  try{localStorage.removeItem("caderneta.preSync");localStorage.removeItem("caderneta.syncAt")}catch(e){}render();syCard();if($("#syDlg").open)$("#syDlg").close();toast("Sincronização desfeita")}
$("#syUndo").onclick=syUndo;$("#syUndoCard").onclick=syUndo;
$("#syBack").onclick=syOpenSend;
$("#syGoSend").onclick=syOpenSend;$("#syGoRecv").onclick=syOpenRecv;
$("#syDlg").addEventListener("click",e=>{if(e.target.closest("[data-close]"))$("#syDlg").close()});
$("#syDlg").addEventListener("close",()=>{syStop();SY.enc=null;SY.inc=null;SY.sendTxt=null});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&(SY.tmr||SY.run))syWake(true)});
function syCard(){let t="",u=null;try{t=localStorage.getItem("caderneta.syncAt")||"";u=localStorage.getItem("caderneta.preSync")}catch(e){}
  $("#syLast").textContent=t?"Última sincronização neste aparelho: "+agoT(t)+".":"Ainda não sincronizaste este aparelho.";$("#syUndoCard").hidden=!u;$("#syGoSend").disabled=!S.items.size}
syCard();
(f=>{render=function(){f();try{if(S.tab==="definicoes")syCard()}catch(e){console.error(e)}}})(render);
