/* node --test dev/sync/*.test.js */
const test=require("node:test"),assert=require("node:assert/strict");
const SYQ=require("./sync_engine.js"),qrcode=require("./vendor/qrcode.min.js"),jsQR=require("./vendor/jsQR.min.js");
const zlib=require("node:zlib");

test("Base45: exemplos do RFC 9285 e ida e volta",()=>{
  const enc=s=>SYQ.b45enc(new TextEncoder().encode(s));
  assert.equal(enc("AB"),"BB8");assert.equal(enc("Hello!!"),"%69 VD92EX0");assert.equal(enc("base-45"),"UJCLQE7W581");
  assert.equal(new TextDecoder().decode(SYQ.b45dec("QED8WEX0")),"ietf!");
  for(let n=0;n<300;n++){const u=new Uint8Array(n).map(()=>Math.random()*256|0);assert.deepEqual(SYQ.b45dec(SYQ.b45enc(u)),u)}
  assert.equal(SYQ.b45dec("GGW"),null); // 65536+ é inválido
  assert.equal(SYQ.b45dec("A"),null);
});

test("CRC32 conhecido",()=>{assert.equal(SYQ.crc32(new TextEncoder().encode("123456789")),0xCBF43926)});

function bytes(n,seed=1){let a=seed;return new Uint8Array(n).map(()=>(a=(a*1103515245+12345)>>>0)>>>24)}

test("fonte: recebe tudo sem perdas só com os blocos simples",()=>{
  const data=bytes(10000),E=SYQ.Encoder(data,250,1234),D=SYQ.Decoder();let r;
  for(let s=0;s<E.K;s++)r=D.add(SYQ.parse(E.frame(s)));
  assert.equal(r,"done");assert.deepEqual(D.result(),data);
});

test("fonte: com 30% dos QR perdidos, recupera com poucos pacotes a mais",()=>{
  let worst=0;
  for(let trial=0;trial<20;trial++){
    const data=bytes(20000+trial*517,trial+3),E=SYQ.Encoder(data,250,777+trial),D=SYQ.Decoder();let got=0,s=0,r;
    let a=trial*99+1;const lose=()=>((a=(a*1664525+1013904223)>>>0)/4294967296)<.3;
    while(r!=="done"&&s<E.K*5){const t=E.frame(s++);if(lose())continue;got++;r=D.add(SYQ.parse(t))}
    assert.equal(r,"done","trial "+trial);assert.deepEqual(D.result(),data);worst=Math.max(worst,got/E.K);
  }
  assert.ok(worst<1.12,"overhead "+worst);
});

test("fonte: começar a meio (perde os primeiros QR todos)",()=>{
  const data=bytes(6000,9),E=SYQ.Encoder(data,200,42),D=SYQ.Decoder();let s=E.K+5,r;
  while(r!=="done"&&s<E.K*8)r=D.add(SYQ.parse(E.frame(s++)));
  assert.equal(r,"done");assert.deepEqual(D.result(),data);
});

test("um só bloco e QR de outra sessão reinicia",()=>{
  const D=SYQ.Decoder(),a=SYQ.Encoder(bytes(50),250,1),b=SYQ.Encoder(bytes(900,4),250,2);
  D.add(SYQ.parse(b.frame(0)));assert.equal(D.state.sid,2);
  assert.equal(D.add(SYQ.parse(a.frame(0))),"done");assert.deepEqual(D.result(),bytes(50));
  assert.equal(SYQ.parse("https://exemplo.pt"),null);assert.equal(SYQ.parse("CAD1:???"),null);
});

test("ida e volta por QR real: gerar a imagem e ler com jsQR",()=>{
  const items=[];for(let i=0;i<400;i++)items.push({id:"t"+i.toString(36)+"x",kind:"tx",type:"out",amount:Math.round(Math.random()*9000)/100,desc:"Compra "+i+" Pingo Doce ção",cat:"Supermercado",date:"2026-10-"+String(1+i%28).padStart(2,"0"),acct:"a1"});
  const raw=Buffer.from(JSON.stringify({items})),z=new Uint8Array(zlib.deflateSync(raw));
  const E=SYQ.Encoder(z,300,99),D=SYQ.Decoder();let s=0,r,ver=0;
  while(r!=="done"&&s<E.K*3){const txt=E.frame(s++),q=qrcode(0,"M");q.addData(txt,"Alphanumeric");q.make();
    const n=q.getModuleCount(),cell=3,m=4,W=(n+2*m)*cell,px=new Uint8ClampedArray(W*W*4).fill(255);ver=n;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))for(let dy=0;dy<cell;dy++)for(let dx=0;dx<cell;dx++){const o=(((y+m)*cell+dy)*W+(x+m)*cell+dx)*4;px[o]=px[o+1]=px[o+2]=0}
    const c=jsQR(px,W,W,{inversionAttempts:"dontInvert"});assert.ok(c,"jsQR leu o QR "+s);r=D.add(SYQ.parse(c.data))}
  assert.equal(r,"done");assert.deepEqual(JSON.parse(zlib.inflateSync(Buffer.from(D.result()))),{items});
  assert.ok(ver<=81,"versão do QR ("+ver+" módulos) deve ficar legível");
});

const o=(id,v)=>({id,kind:"tx",amount:v});
test("juntar: novo, igual, mais recente ganha, empate ganha o que chega",()=>{
  const local=[o("a",1),o("b",2),o("c",3),o("d",4)],inc=[o("a",1),o("b",20),o("c",30),o("d",40),o("e",5)];
  const lm={mod:{c:200,d:100}},im={mod:{b:50,c:100,d:100}};
  const p=SYQ.plan(local,lm,inc,im,"merge");
  assert.deepEqual(p.add.map(x=>x.id),["e"]);assert.equal(p.same,1);
  assert.deepEqual(p.upd.map(x=>x.id),["b","d"]); // b: 50>0; d: empate → o que chega
  assert.deepEqual(p.keep,["c"]);assert.deepEqual(p.del,[]);
});

test("juntar: apagados viajam, mas uma alteração mais recente vence",()=>{
  const local=[o("a",1),o("b",2)],inc=[o("x",9)];
  const p=SYQ.plan(local,{mod:{b:500}},inc,{del:{a:100,b:300}},"merge");
  assert.deepEqual(p.del,["a"]);
  const m=SYQ.mergeMeta({mod:{b:500}},{del:{a:100,b:300}},p,1000);
  assert.equal(m.del.a,1000);assert.equal(m.mod.b,500);assert.equal(m.del.b,undefined);
  // registo apagado aqui depois de o outro o ter mudado: fica apagado
  const q=SYQ.plan([],{del:{z:900}},[o("z",1)],{mod:{z:800}},"merge");assert.deepEqual(q.add,[]);assert.deepEqual(q.keep,["z"]);
  const q2=SYQ.plan([],{del:{z:700}},[o("z",1)],{mod:{z:800}},"merge");assert.deepEqual(q2.add.map(x=>x.id),["z"]);
});

test("substituir: fica igual ao outro aparelho",()=>{
  const p=SYQ.plan([o("a",1),o("b",2)],{mod:{a:999}},[o("a",5),o("c",3)],{},"replace");
  assert.deepEqual(p.upd.map(x=>x.id),["a"]);assert.deepEqual(p.add.map(x=>x.id),["c"]);assert.deepEqual(p.del,["b"]);
});

test("enviar e depois enviar de volta deixa os dois iguais",()=>{
  let A=[o("a",1),o("b",2),o("s",7)],B=[o("a",10),o("c",3),o("s",7)],mA={mod:{b:10},del:{c:5}},mB={mod:{a:20},del:{}};
  const apply=(L,p)=>{const m=new Map(L.map(x=>[x.id,x]));p.add.concat(p.upd).forEach(x=>m.set(x.id,x));p.del.forEach(id=>m.delete(id));return[...m.values()]};
  let p=SYQ.plan(B,mB,A,mA,"merge");B=apply(B,p);mB=SYQ.mergeMeta(mB,mA,p,30);
  p=SYQ.plan(A,mA,B,mB,"merge");A=apply(A,p);mA=SYQ.mergeMeta(mA,mB,p,40);
  const k=L=>JSON.stringify(L.slice().sort((x,y)=>x.id<y.id?-1:1));
  assert.equal(k(A),k(B));assert.equal(k(A),k([o("a",10),o("b",2),o("s",7)])); // c foi apagado em A depois de existir em B
});

test("troca nos dois sentidos ao mesmo tempo (ligação direta) deixa os dois iguais",()=>{
  for(let k=0;k<200;k++){let a=k*7919+13;const R=()=>((a=(a*1664525+1013904223)>>>0)/4294967296);
    const ids="abcdefgh".split(""),A=[],B=[],mA={mod:{},del:{}},mB={mod:{},del:{}};
    for(const id of ids){const r=R();const t=()=>R()<.4?0:1+Math.floor(R()*3);
      if(r<.3){A.push(o(id,Math.floor(R()*3)));B.push(o(id,Math.floor(R()*3)));const ta=t(),tb=t();if(ta)mA.mod[id]=ta;if(tb)mB.mod[id]=tb}
      else if(r<.5){A.push(o(id,1));const ta=t();if(ta)mA.mod[id]=ta;if(R()<.5)mB.del[id]=1+Math.floor(R()*3)}
      else if(r<.7){B.push(o(id,2));const tb=t();if(tb)mB.mod[id]=tb;if(R()<.5)mA.del[id]=1+Math.floor(R()*3)}}
    const apply=(L,p)=>{const m=new Map(L.map(x=>[x.id,x]));p.add.concat(p.upd).forEach(x=>m.set(x.id,x));p.del.forEach(id=>m.delete(id));return[...m.values()]};
    const pA=SYQ.plan(A,mA,B,mB,"merge","stable"),pB=SYQ.plan(B,mB,A,mA,"merge","stable");
    const k2=L=>JSON.stringify(L.slice().sort((x,y)=>x.id<y.id?-1:1));
    assert.equal(k2(apply(A,pA)),k2(apply(B,pB)),"caso "+k);
  }
});

test("limpar apagados antigos",()=>{assert.deepEqual(SYQ.pruneDel({a:1,b:1e12},1e12+1000,180),{b:1e12})});
