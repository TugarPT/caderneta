/* ---------- sincronizar por QR: motor puro (sem DOM, sem rede) ----------
   Os dados vão comprimidos e partidos em blocos. Cada QR leva um bloco: primeiro os blocos tal como são,
   depois combinações XOR de vários blocos (código fonte / "fountain", LT). Quem recebe pode perder
   qualquer QR: as combinações seguintes tapam os buracos, sem esperar por uma volta inteira.
   Texto do QR: "CAD1:" + Base45 (RFC 9285), que cabe no modo alfanumérico do QR (quase sem perda). */
const SYQ=(()=>{
const B45="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function b45enc(u8){let s="";for(let i=0;i+1<u8.length;i+=2){let n=u8[i]*256+u8[i+1];const c=n%45;n=(n-c)/45;const d=n%45,e=(n-d)/45;s+=B45[c]+B45[d]+B45[e]}
  if(u8.length%2){const n=u8[u8.length-1];s+=B45[n%45]+B45[(n-n%45)/45]}return s}
function b45dec(s){const L=s.length,out=new Uint8Array(Math.floor(L/3)*2+(L%3===2?1:0));if(L%3===1)return null;let o=0;
  for(let i=0;i<L;i+=3){const a=B45.indexOf(s[i]),b=B45.indexOf(s[i+1]);if(a<0||b<0)return null;
    if(i+2<L){const c=B45.indexOf(s[i+2]);if(c<0)return null;const n=a+b*45+c*2025;if(n>65535)return null;out[o++]=n>>8;out[o++]=n&255}
    else{const n=a+b*45;if(n>255)return null;out[o++]=n}}return out}
const CRCT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRCT[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
/* que blocos entram no pacote "seq" (igual nos dois lados): voltas alternadas de blocos simples e de
   combinações aleatórias densas (cada bloco entra com probabilidade 1/2), que quase sempre trazem informação nova */
function picks(K,seq,sid){const r=Math.floor(seq/K);if(K===1||r%2===0)return[seq%K];const g=rng((seq*2654435761)^sid),L=[];
  for(let i=0;i<K;i++)if(g()<.5)L.push(i);if(!L.length)L.push(Math.floor(g()*K));return L}
const HDR=18; /* sid 4, K 2, len 4, crc 4, seq 4 */
function Encoder(bytes,blockSize,sid){const B=blockSize,K=Math.max(1,Math.ceil(bytes.length/B)),crc=crc32(bytes),blocks=[];
  if(K>65535)throw new Error("too big");
  for(let i=0;i<K;i++){const b=new Uint8Array(B);b.set(bytes.subarray(i*B,Math.min(bytes.length,(i+1)*B)));blocks.push(b)}
  sid=(sid>>>0)||1;
  return{K,B,sid,len:bytes.length,
    frame(seq){const ix=picks(K,seq,sid),u=new Uint8Array(HDR+B),v=new DataView(u.buffer);
      v.setUint32(0,sid);v.setUint16(4,K);v.setUint32(6,bytes.length);v.setUint32(10,crc);v.setUint32(14,seq);
      for(const i of ix){const b=blocks[i];for(let j=0;j<B;j++)u[HDR+j]^=b[j]}return "CAD1:"+b45enc(u)}}}
function parse(txt){txt=String(txt||"").trim();if(txt.slice(0,5).toUpperCase()!=="CAD1:")return null;const u=b45dec(txt.slice(5).toUpperCase());if(!u||u.length<=HDR)return null;
  const v=new DataView(u.buffer);const f={sid:v.getUint32(0),K:v.getUint16(4),len:v.getUint32(6),crc:v.getUint32(10),seq:v.getUint32(14),data:u.slice(HDR)};
  if(!f.K||f.len>f.K*f.data.length||f.len<=(f.K-1)*f.data.length)return null;return f}
/* descodificador: eliminação de Gauss em GF(2). Cada pacote é uma linha (que blocos leva) + dados;
   guarda-se em escada pelo bit mais baixo. Com K linhas independentes, resolve-se de trás para a frente. */
function Decoder(){let st=null;
  function reset(f){const W=Math.ceil(f.K/32);st={sid:f.sid,K:f.K,B:f.data.length,len:f.len,crc:f.crc,W,rows:new Array(f.K).fill(null),n:0,seen:new Set(),frames:0}}
  const low=c=>{for(let w=0;w<c.length;w++)if(c[w]){const v=c[w];return w*32+31-Math.clz32(v&-v)}return -1};
  const x32=(a,b)=>{for(let i=0;i<a.length;i++)a[i]^=b[i]};
  return{
    get state(){return st},
    add(f){if(!f)return"bad";if(!st||st.sid!==f.sid||st.K!==f.K||st.crc!==f.crc||st.B!==f.data.length)reset(f);
      if(st.seen.has(f.seq))return st.n===st.K?"done":"dup";st.seen.add(f.seq);st.frames++;if(st.n===st.K)return"done";
      const c=new Uint32Array(st.W);for(const i of picks(st.K,f.seq,st.sid))c[i>>5]^=1<<(i&31);
      const d8=new Uint8Array(Math.ceil(st.B/4)*4);d8.set(f.data);const d=new Uint32Array(d8.buffer);
      for(;;){const p=low(c);if(p<0)break;const r=st.rows[p];if(!r){st.rows[p]={c,d};st.n++;break}x32(c,r.c);x32(d,r.d)}
      return st.n===st.K?"done":"more"},
    progress(){return st?st.n/st.K:0},
    result(){if(!st||st.n!==st.K)return null;const K=st.K,R=st.rows,sol=new Array(K);
      for(let p=K-1;p>=0;p--){const r=R[p],d=r.d.slice();for(let w=p>>5;w<st.W;w++){const b0=p&31;let v=r.c[w];if(w===p>>5)v=b0===31?0:v&(~0<<(b0+1));
          while(v){const b=31-Math.clz32(v&-v);v&=v-1;x32(d,sol[w*32+b])}}sol[p]=d}
      const out=new Uint8Array(K*st.B);sol.forEach((d,i)=>out.set(new Uint8Array(d.buffer,0,st.B),i*st.B));
      const r=out.slice(0,st.len);return crc32(r)===st.crc?r:false},
    reset(){st=null}}}

/* ---------- juntar dados ----------
   meta: {mod:{id:ms}, del:{id:ms}} — quando cada registo mudou ou foi apagado neste aparelho.
   Regras: ganha a alteração mais recente; em empate (registos de antes da sincronização, sem data) ganha o que chega,
   para que "enviar e depois enviar de volta" deixe os dois aparelhos iguais. */
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/* tie: "incoming" (envio num só sentido) ou "stable" (troca nos dois sentidos ao mesmo tempo: os dois lados escolhem o mesmo) */
function plan(local,lmeta,inc,imeta,mode,tie){const L=new Map(local.map(o=>[o.id,o])),lm=lmeta.mod||{},ld=lmeta.del||{},im=imeta.mod||{},idl=imeta.del||{};
  const add=[],upd=[],del=[],keep=[],sameN={n:0},inIds=new Set();
  for(const o of inc){inIds.add(o.id);const l=L.get(o.id),tI=+im[o.id]||0;
    if(!l){if(mode!=="replace"&&ld[o.id]!=null&&(+ld[o.id]||0)>=tI){keep.push(o.id);continue}add.push(o);continue}
    if(same(l,o)){sameN.n++;continue}
    const tL=+lm[o.id]||0;
    if(mode==="replace"||tI>tL||tI===tL&&(tie!=="stable"||JSON.stringify(o)>JSON.stringify(l)))upd.push(o);else keep.push(o.id)}
  if(mode==="replace"){for(const l of local)if(!inIds.has(l.id))del.push(l.id)}
  else for(const id in idl){if(inIds.has(id))continue;const l=L.get(id);if(l&&(+idl[id]||0)>=(+lm[id]||0))del.push(id)}
  return{add,upd,del,keep,same:sameN.n}}
/* metadados depois de aplicar o plano: datas do que veio, apagados juntos (fica a data mais recente de cada) */
function mergeMeta(lmeta,imeta,p,now){const mod=Object.assign({},lmeta.mod||{}),dl=Object.assign({},lmeta.del||{}),im=imeta.mod||{},idl=imeta.del||{};
  for(const o of p.add.concat(p.upd)){if(im[o.id])mod[o.id]=im[o.id];else delete mod[o.id];delete dl[o.id]}
  for(const id in idl){const t=+idl[id]||0;if(t>=(+mod[id]||0)){dl[id]=Math.max(t,+dl[id]||0);if(mod[id]&&t>=mod[id])delete mod[id]}}
  for(const id of p.del){dl[id]=Math.max(+dl[id]||0,+idl[id]||0,now||0);delete mod[id]}
  return{mod,del:dl}}
function pruneDel(del,now,days){const out={},lim=now-days*864e5;for(const id in del)if(del[id]>=lim)out[id]=del[id];return out}
return{b45enc,b45dec,crc32,Encoder,Decoder,parse,picks,plan,mergeMeta,pruneDel,HDR}})();
if(typeof module!=="undefined")module.exports=SYQ;
