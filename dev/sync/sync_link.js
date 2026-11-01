/* ---------- ligação direta: só o telemóvel lê um QR e os dados vão nos dois sentidos ----------
   Um aparelho mostra um QR com um endereço de encontro e uma chave. O outro lê-o e os dois combinam a ligação
   (WebRTC) através de um serviço público grátis e sem conta (ntfy.sh), com mensagens cifradas (AES-GCM) com a
   chave do QR: o serviço só vê texto ilegível. Os dados vão diretos de aparelho para aparelho, cifrados (DTLS). */
const SYL={relay:"https://ntfy.sh/",ice:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun.cloudflare.com:3478"}],
  pc:null,dc:null,off:null,key:null,topic:null,me:"",role:"",seen:new Set(),tmo:0,rx:null,txDone:false,rxDone:false,closing:0};
const syB64={enc(u){let s="";for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")},
  dec(s){s=String(s).replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}};
/* serviço de encontro (só para combinar a ligação; nos testes é trocado por um falso) */
const SYRelay={
  send(topic,msg){return fetch(SYL.relay+topic,{method:"POST",body:msg,cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("relay "+r.status)})},
  listen(topic,cb,err){const es=new EventSource(SYL.relay+topic+"/sse?since=5m");let ok=false;
    es.onopen=()=>{ok=true};es.onmessage=e=>{try{const j=JSON.parse(e.data);if(j&&j.event==="message"&&j.message)cb(j.message)}catch(x){}};
    es.onerror=()=>{if(!ok&&es.readyState===2)err&&err()};return()=>es.close()}};
async function sylSeal(o){const iv=crypto.getRandomValues(new Uint8Array(12)),z=await syZip(JSON.stringify(o)),
  c=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},SYL.key,z)),u=new Uint8Array(12+c.length);u.set(iv);u.set(c,12);return syB64.enc(u)}
async function sylOpen(s){const u=syB64.dec(s),p=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:u.subarray(0,12)},SYL.key,u.subarray(12)));return JSON.parse(await syUnzip(p))}
const sylRand=n=>{const a="abcdefghijkmnpqrstuvwxyz23456789",u=crypto.getRandomValues(new Uint8Array(n));let s="";for(const b of u)s+=a[b%a.length];return s};
function sylMsg(t,err){const m=$("#sylMsg");m.textContent=t||"";m.classList.toggle("err",!!err)}
function sylStep(n){document.querySelectorAll("#sylSteps li").forEach((li,i)=>{li.classList.toggle("done",i<n);li.classList.toggle("now",i===n)})}
function sylProg(){const tx=SYL.txN?SYL.txS/SYL.txN:0,rx=SYL.rx&&SYL.rx.len?SYL.rx.got/SYL.rx.len:0;
  $("#sylBar").style.width=((tx+rx)*50).toFixed(1)+"%";$("#sylPct").textContent=`A enviar ${Math.floor(tx*100)}% · a receber ${Math.floor(rx*100)}%`}
function sylClose(now){clearTimeout(SYL.tmo);if(SYL.off){SYL.off();SYL.off=null}
  const go=()=>{try{SYL.dc&&SYL.dc.close()}catch(e){}try{SYL.pc&&SYL.pc.close()}catch(e){}SYL.pc=SYL.dc=null};
  /* se ainda estamos a enviar, espera um pouco para o outro lado receber tudo */
  if(!now&&SYL.dc&&SYL.dc.readyState==="open"&&(!SYL.txDone||SYL.dc.bufferedAmount>0)){let k=0;const w=()=>{if(++k>120||!SYL.dc||SYL.dc.bufferedAmount===0&&SYL.txDone)go();else SYL.closing=setTimeout(w,250)};w()}else go()}
function sylFail(t){clearTimeout(SYL.tmo);sylMsg(t,1);$("#sylAlt").hidden=false;sylClose(true)}
function sylPC(){const pc=new RTCPeerConnection({iceServers:SYL.ice});SYL.pc=pc;
  pc.onconnectionstatechange=()=>{if(pc!==SYL.pc)return;if(pc.connectionState==="failed")sylFail("Não consegui ligar os dois aparelhos diretamente. Liga os dois à mesma rede Wi-Fi e tenta outra vez, ou usa o QR animado.");
    else if(pc.connectionState==="disconnected"&&!SYL.rxDone)sylMsg("A ligação caiu. A tentar de novo…")};return pc}
const sylGather=pc=>new Promise(res=>{if(pc.iceGatheringState==="complete")return res();const t=setTimeout(res,4000);pc.addEventListener("icegatheringstatechange",()=>{if(pc.iceGatheringState==="complete"){clearTimeout(t);res()}})});
async function sylPost(o){o.f=SYL.me;await SYRelay.send(SYL.topic,await sylSeal(o))}
function sylListen(on){SYL.off=SYRelay.listen(SYL.topic,async m=>{if(SYL.seen.has(m))return;SYL.seen.add(m);let o;try{o=await sylOpen(m)}catch(e){return}if(!o||o.f===SYL.me)return;on(o)},
  ()=>sylFail("Este aparelho não conseguiu chegar ao serviço de ligação. Precisa de internet só para combinar a ligação. Sem internet, usa o QR animado."))}
function sylChan(dc){SYL.dc=dc;dc.binaryType="arraybuffer";
  dc.onopen=()=>{clearTimeout(SYL.tmo);sylStep(2);sylMsg("Ligados. A trocar os dados…");try{navigator.vibrate&&navigator.vibrate(40)}catch(e){}sylSendData()};
  dc.onmessage=e=>{if(typeof e.data==="string"){let j;try{j=JSON.parse(e.data)}catch(x){return}
      if(j.t==="hdr"){SYL.rx={len:j.len,got:0,parts:[]};sylProg()}
      else if(j.t==="end"&&SYL.rx)sylGotData()}
    else if(SYL.rx){SYL.rx.parts.push(new Uint8Array(e.data));SYL.rx.got+=e.data.byteLength;sylProg()}};
  dc.onclose=()=>{if(!SYL.rxDone&&$("#syDlg").open&&!$("#syLink").hidden)sylFail("A ligação fechou antes do fim. Tenta outra vez.")}}
async function sylSendData(){const dc=SYL.dc,u=await syZip(JSON.stringify(syPayload())),C=16384;SYL.txN=u.length;SYL.txS=0;SYL.txDone=false;
  dc.send(JSON.stringify({t:"hdr",len:u.length}));
  for(let i=0;i<u.length;i+=C){while(dc.readyState==="open"&&dc.bufferedAmount>1048576)await new Promise(r=>setTimeout(r,30));if(dc.readyState!=="open")return;
    dc.send(u.slice(i,i+C));SYL.txS=Math.min(u.length,i+C);sylProg()}
  dc.send(JSON.stringify({t:"end"}));SYL.txDone=true;sylProg();if(SYL.rxDone)sylReview()}
async function sylGotData(){const r=SYL.rx,u=new Uint8Array(r.got);let o=0;for(const p of r.parts){u.set(p,o);o+=p.length}
  try{SYL.inJ=JSON.parse(await syUnzip(u))}catch(e){sylFail("Os dados chegaram estragados. Tenta outra vez.");return}
  SYL.rxDone=true;if(SYL.txDone)sylReview();else sylMsg("Recebido. A acabar de enviar os teus dados…")}
function sylReview(){sylStep(3);SY.link=true;syReview(SYL.inJ)}
function sylReset(role){syStop();sylClose(true);clearTimeout(SYL.closing);Object.assign(SYL,{role,me:sylRand(6),seen:new Set(),rx:null,txDone:false,rxDone:false,inJ:null,txN:0,txS:0});SY.link=false;
  $("#syTitle").textContent="Sincronizar nos dois sentidos";syShow("syLink");if(!$("#syDlg").open)$("#syDlg").showModal();
  $("#sylAlt").hidden=true;$("#sylBar").style.width="0";$("#sylPct").textContent="";sylMsg("");$("#sylQrBox").hidden=role!=="host";sylStep(role==="host"?0:1)}
const sylOK=()=>typeof RTCPeerConnection!=="undefined"&&window.crypto&&crypto.subtle&&typeof EventSource!=="undefined";
/* computador (ou qualquer aparelho): mostra o QR e espera */
async function sylHost(){sylReset("host");if(!sylOK()){sylFail("Este navegador não faz ligações diretas. Usa o QR animado.");return}
  const raw=crypto.getRandomValues(new Uint8Array(16));SYL.key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);SYL.topic="cad-"+sylRand(22);
  const url=(/^https?:/.test(location.protocol)?location.origin+location.pathname:"https://tugarpt.github.io/caderneta/")+"#sy="+SYL.topic+"."+syB64.enc(raw);
  const q=qrcode(0,"M");q.addData(url,"Byte");q.make();const n=q.getModuleCount(),m=4,c=$("#sylQr"),cell=Math.max(4,Math.floor(420/(n+2*m))),W=(n+2*m)*cell;c.width=c.height=W;
  const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,W,W);g.fillStyle="#000";for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))g.fillRect((x+m)*cell,(y+m)*cell,cell,cell);
  sylMsg("À espera do outro aparelho…");syWake(true);
  sylListen(async o=>{if(o.t!=="offer"||SYL.pc)return;sylStep(1);sylMsg("O telemóvel leu o código. A ligar…");$("#sylQrBox").hidden=true;
    try{const pc=sylPC();pc.ondatachannel=e=>sylChan(e.channel);await pc.setRemoteDescription({type:"offer",sdp:o.sdp});await pc.setLocalDescription(await pc.createAnswer());
      await sylGather(pc);await sylPost({t:"answer",sdp:pc.localDescription.sdp});
      SYL.tmo=setTimeout(()=>{if(!SYL.dc||SYL.dc.readyState!=="open")sylFail("Não consegui ligar os dois aparelhos diretamente. Liga os dois à mesma rede Wi-Fi e tenta outra vez, ou usa o QR animado.")},30000)}
    catch(e){sylFail("Não consegui responder ao outro aparelho ("+(e&&e.message||"erro")+"). Tenta outra vez.")}})}
/* telemóvel: leu o QR (na app ou com a câmara do Android, que abre o endereço) */
async function sylGuest(topic,k){sylReset("guest");if(!sylOK()){sylFail("Este navegador não faz ligações diretas. Usa o QR animado.");return}
  try{SYL.key=await crypto.subtle.importKey("raw",syB64.dec(k),"AES-GCM",false,["encrypt","decrypt"])}catch(e){sylFail("Este código não é válido. Mostra um código novo no outro aparelho.");return}
  SYL.topic=topic;sylMsg("A ligar ao outro aparelho…");syWake(true);
  sylListen(async o=>{if(o.t!=="answer"||!SYL.pc||SYL.pc.remoteDescription)return;try{await SYL.pc.setRemoteDescription({type:"answer",sdp:o.sdp})}catch(e){sylFail("Não consegui ligar ("+(e&&e.message||"erro")+").")}});
  try{const pc=sylPC();sylChan(pc.createDataChannel("sync",{ordered:true}));await pc.setLocalDescription(await pc.createOffer());await sylGather(pc);
    await sylPost({t:"offer",sdp:pc.localDescription.sdp})}
  catch(e){sylFail("Não consegui chegar ao serviço de ligação. Precisa de internet só para combinar a ligação. Sem internet, usa o QR animado.");return}
  SYL.tmo=setTimeout(()=>{if(!SYL.dc||SYL.dc.readyState!=="open")sylFail(SYL.pc&&SYL.pc.remoteDescription?"Não consegui ligar os dois aparelhos diretamente. Liga os dois à mesma rede Wi-Fi e tenta outra vez, ou usa o QR animado."
    :"O outro aparelho não respondeu. Confirma que ainda está a mostrar o código (e que tem internet) e lê-o outra vez.")},35000)}
const sylParse=t=>{const m=String(t||"").match(/#sy=(cad-[a-z0-9]{10,40})\.([A-Za-z0-9_-]{20,24})/);return m?{topic:m[1],k:m[2]}:null};
$("#syGoLink").onclick=sylHost;
$("#sylAlt").onclick=()=>{sylClose(true);syOpenSend()};
$("#syDlg").addEventListener("close",()=>{sylClose(false);SY.link=false});
/* aberto pela câmara do Android: caderneta/#sy=... */
{const L=sylParse(location.hash);if(L){history.replaceState(null,"",location.pathname+location.search);setTimeout(()=>{setTab("definicoes");sylGuest(L.topic,L.k)},300)}}
