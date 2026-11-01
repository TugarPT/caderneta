/* Caderneta · motor de cálculo das Poupanças (Certificados de Aforro, Certificados do Tesouro, contas poupança, depósitos a prazo).
   Código puro, sem DOM nem rede: o mesmo ficheiro corre na app (window.SE) e nos testes (node --test dev/savings/*.test.js).

   Separação dos dados:
   - RULES ............ regras oficiais de cada produto (com fonte e data de consulta). Mudar uma regra = mudar só esta tabela.
   - cfg.rates ........ taxas base mensais (oficiais IGCP, registadas pelo utilizador ou calculadas da Euribor que ele indicou).
   - cfg.proj ......... cenário hipotético para meses futuros (nunca é tratado como taxa oficial).
   - docs caf / sav ... dados introduzidos pelo utilizador (subscrições, depósitos, resgates).
   - run*() ........... resultados calculados; nunca são guardados.

   Convenções: datas em texto ISO "AAAA-MM-DD"; taxas em % ao ano; valores em euros arredondados ao cêntimo
   (meio cêntimo arredonda para cima). Cada vencimento: juros brutos → IRS retido → juros líquidos → somados ao capital. */
(function(root){
"use strict";
const VERSION="2026-11-01";

/* ---------- números ---------- */
const rN=(v,d)=>{const f=Math.pow(10,d);return Math.sign(v)*Math.round(Math.abs(v)*f+1e-7)/f};
const r2=v=>rN(v,2),r3=v=>rN(v,3);
const num=v=>v===null||v===undefined||v===""?null:(isFinite(+v)?+v:null);

/* ---------- datas (sem fusos horários) ---------- */
const P=s=>{const a=String(s).split("-").map(Number);return{y:a[0],m:a[1],d:a[2]}};
const pad=n=>String(n).padStart(2,"0");
const isoOf=(y,m,d)=>y+"-"+pad(m)+"-"+pad(d);
const dim=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const dnum=s=>{const p=P(s);return Math.round(Date.UTC(p.y,p.m-1,p.d)/864e5)};
const days=(a,b)=>dnum(b)-dnum(a);
const ymOf=s=>String(s).slice(0,7);
const addDays=(s,n)=>new Date((dnum(s)+n)*864e5).toISOString().slice(0,10);
/* n meses depois de s. Regra "next1" (IGCP): se o dia não existe nesse mês, vence no dia 1 do mês seguinte.
   Regra "clamp" (bancos): último dia do mês. */
function addMonths(s,n,rule){const p=P(s),t=p.m-1+n,y=p.y+Math.floor(t/12),m=((t%12)+12)%12+1,L=dim(y,m);
  if(p.d<=L)return isoOf(y,m,p.d);
  if(rule==="clamp")return isoOf(y,m,L);
  return m===12?isoOf(y+1,1,1):isoOf(y,m+1,1)}
/* anos e meses completos entre a e b (antiguidade) */
function ageYM(a,b){const A=P(a),B=P(b);let m=(B.y-A.y)*12+(B.m-A.m);if(B.d<A.d)m--;m=Math.max(0,m);return{y:Math.floor(m/12),m:m%12,months:m}}

/* ---------- regras oficiais ---------- */
const IGCP_URL="https://www.igcp.pt/pt/aforristas/produtos-de-aforro/certificados-de-aforro";
const RULES={
  caf:{
    F:{name:"Série F",active:true,termY:15,periodM:3,dayRule:"next1",unit:1,minUnits:10,
      base:{spread:0,min:0,max:2.5,dec:3,days:10,fixed:"antepenúltimo dia útil do mês, para o mês seguinte"},
      prem:[{from:2,to:5,pp:.25},{from:6,to:9,pp:.5},{from:10,to:11,pp:1},{from:12,to:13,pp:1.5},{from:14,to:15,pp:1.75}],
      redeemAfter:1,capNet:true,
      src:{label:"IGCP · Portaria n.º 149-A/2023 · ficha de produto Série F (abril 2026)",url:IGCP_URL,checked:"2026-11-01"}},
    E:{name:"Série E",active:false,termY:10,periodM:3,dayRule:"next1",unit:1,
      base:{spread:1,min:0,max:3.5,dec:3,days:10,fixed:"antepenúltimo dia útil do mês, para o mês seguinte"},
      prem:[{from:2,to:5,pp:.5},{from:6,to:10,pp:1}],
      redeemAfter:1,capNet:true,
      src:{label:"IGCP · Portaria n.º 329-A/2017 · ficha técnica Série E",url:"https://www.igcp.pt/pt/ficha-tecnica-certificados-de-aforro-serie-e",checked:"2026-11-01"}},
    /* séries antigas: as regras não estão carregadas na app; a taxa bruta de cada trimestre é a que o utilizador indicar */
    D:{name:"Série D",manual:true,periodM:3,dayRule:"next1",redeemAfter:1,capNet:true},
    C:{name:"Série C",manual:true,periodM:3,dayRule:"next1",redeemAfter:1,capNet:true},
    B:{name:"Série B",manual:true,periodM:3,dayRule:"next1",redeemAfter:1,capNet:true},
    A:{name:"Série A",manual:true,periodM:3,dayRule:"next1",redeemAfter:1,capNet:true}
  },
  /* produtos bancários e do Tesouro: regras genéricas, os parâmetros (taxa, prazo, periodicidade) vêm do contrato do utilizador */
  sav:{
    conta:{name:"Conta poupança",periodM:12,basis:365,cap:true,early:"keep",liquid:true},
    dp:{name:"Depósito a prazo",periodM:0,basis:365,cap:false,early:"lose",termM:12},
    ct:{name:"Certificados do Tesouro",periodM:12,basis:"per",cap:false,early:"lose",redeemAfter:1,sched:true},
    outro:{name:"Outro produto",periodM:12,basis:365,cap:true,early:"keep"}
  }
};
const TAX={rate:28,regimes:{lib:"Taxa liberatória (retenção definitiva)",eng:"Englobamento (retenção por conta)",isento:"Sem retenção / outra taxa"}};

function premium(R,y){if(!R||!R.prem)return 0;const b=R.prem.find(x=>y>=x.from&&y<=x.to);return b?b.pp:0}
/* média da Euribor a 3 meses (dez dias úteis), arredondada à 3.ª casa decimal */
function euriborAvg(vals){const v=(vals||[]).map(num).filter(x=>x!==null);if(!v.length)return null;return r3(v.reduce((a,b)=>a+b,0)/v.length)}
/* taxa base de uma série a partir da média da Euribor: E3 (+ spread), limitada ao intervalo oficial */
function baseFromEuribor(serie,avg){const R=RULES.caf[serie];if(!R||!R.base||avg===null||avg===undefined||!isFinite(avg))return null;
  return r3(Math.min(R.base.max,Math.max(R.base.min,r3(avg)+R.base.spread)))}

/* ---------- livro de taxas base mensais ---------- */
/* cfg = {rates:{F:{"2026-09":{v,o:"igcp"|"user"|"euribor",src,at}}}, proj:{F:2.1}, fallback:{F:2}} */
const KIND={oficial:"oficial",derivada:"derivada da taxa oficial da Série F",euribor:"calculada da Euribor",registada:"registada por ti",utilizador:"indicada por ti",estimada:"estimada",hipotetica:"hipotética",desconhecida:"sem taxa"};
function rateBook(cfg,today){const rates=(cfg&&cfg.rates)||{},proj=(cfg&&cfg.proj)||{},fb=(cfg&&cfg.fallback)||{},cur=ymOf(today);
  /* Série E a partir da Série F do mesmo mês: as duas usam a mesma média E3 (fixada no mesmo dia).
     F = min(2,5; max(0; E3)) e E = min(3,5; max(0; E3 + 1)). Se 0 < F < 2,5 então E3 = F e E = F + 1; se F = 2,5 então E3 ≥ 2,5 e E = 3,5.
     Com F = 0 não se sabe E3, por isso não se deriva. */
  const tabs={};Object.keys(rates).forEach(s=>tabs[s]=rates[s]);
  const dF=rates.F||{},dE={};Object.keys(dF).forEach(k=>{const f=num(dF[k].v);if(f!==null&&f>0)dE[k]={v:r3(Math.min(3.5,f>=2.5?3.5:f+1)),o:"derived"}});
  tabs.E=Object.assign(dE,rates.E||{});
  return function(serie,key){const T=tabs[serie]||{},row=T[key];
    if(row&&num(row.v)!==null)return{v:+row.v,kind:row.o==="igcp"?"oficial":row.o==="euribor"?"euribor":row.o==="derived"?"derivada":"registada",ref:key};
    const keys=Object.keys(T).filter(k=>num(T[k].v)!==null).sort(),prev=keys.filter(k=>k<key).pop();
    if(key>cur){if(num(proj[serie])!==null)return{v:+proj[serie],kind:"hipotetica",ref:"cenário"};
      if(prev)return{v:+T[prev].v,kind:"hipotetica",ref:prev}}
    else{if(prev)return{v:+T[prev].v,kind:"estimada",ref:prev};
      if(num(fb[serie])!==null)return{v:+fb[serie],kind:"estimada",ref:"valor por omissão"};
      const nx=keys.find(k=>k>key);if(nx)return{v:+T[nx].v,kind:"estimada",ref:nx}}
    if(num(fb[serie])!==null)return{v:+fb[serie],kind:"hipotetica",ref:"valor por omissão"};
    return{v:null,kind:"desconhecida",ref:null}}}
const constBook=(v,kind)=>()=>({v,kind:kind||"hipotetica",ref:"cenário"});

/* ---------- Certificados de Aforro: uma subscrição ---------- */
/* sub = {serie, date, amount (capital ainda aplicado), amount0?, soldCost?, sales:[{d,c,v}], override?, ovDate?, rates:{k:taxa bruta}, rate0?, rateM?, termY?, irs?}
   ctx = {today, book, irs, until?} */
function cafPrincipal0(sub){return num(sub.amount0)>0?+sub.amount0:r2((+sub.amount||0)+(+sub.soldCost||0))}
function runCaf(sub,ctx){
  const R=RULES.caf[sub.serie]||RULES.caf.F,today=ctx.today,irs=num(sub.irs)!==null?+sub.irs:(num(ctx.irs)!==null?+ctx.irs:TAX.rate);
  const P0=cafPrincipal0(sub),pm=R.periodM,termY=R.termY||num(sub.termY),termN=termY?termY*12/pm:null;
  const until=ctx.until||addMonths(today,12*16,"clamp"),start=sub.date;
  /* resgates: fração do capital resgatado em cada um (capital resgatado ÷ capital antes do resgate) */
  let pr=P0;const S=(sub.sales||[]).filter(s=>s&&s.d).slice().sort((a,b)=>a.d.localeCompare(b.d)).map(s=>{const c=Math.min(Math.max(+s.c||0,0),pr),f=pr>0?c/pr:0;pr=r2(pr-c);return{d:s.d,c,v:num(s.v),f}});
  const ov=num(sub.override)>0&&sub.ovDate?{d:sub.ovDate,v:+sub.override/S.filter(s=>s.d>sub.ovDate).reduce((a,s)=>a*(1-s.f),1)}:null;
  let cap=P0,prin=P0,si=0,ovDone=!ov,k=0,prev=start,matured=null;
  const ev=[],pts=[{d:start,cap,prin,t:"sub"}],adj=[];
  const doSale=s=>{const v=r2(cap*s.f);cap=r2(cap-v);prin=r2(prin-s.c);pts.push({d:s.d,cap,prin,t:"red",v:s.v!==null?s.v:v,c:s.c})};
  const doOv=()=>{const d=r2(ov.v-cap);if(Math.abs(d)>=.005)adj.push({d:ov.d,delta:d});cap=r2(ov.v);pts.push({d:ov.d,cap,prin,t:"ov"});ovDone=true};
  const flush=lim=>{for(;;){const sN=si<S.length&&S[si].d<lim?S[si]:null,oN=!ovDone&&ov.d<lim;
    if(sN&&(!oN||sN.d<=ov.d)){doSale(sN);si++;continue}if(oN){doOv();continue}break}};
  while(prin>0){k++;if(termN&&k>termN)break;const date=addMonths(start,k*pm,R.dayRule);if(!termN&&date>until)break;
    flush(date);if(prin<=0)break;
    const y=Math.ceil(k*pm/12),pp=premium(R,y),man=sub.rates&&num(sub.rates[k])!==null?+sub.rates[k]:k===1&&num(sub.rate0)!==null?+sub.rate0:null;
    let rate;
    if(man!==null)rate={gross:man,base:r3(man-pp),prem:pp,kind:"utilizador",ref:null};
    else if(R.manual){const L=Object.keys(sub.rates||{}).map(Number).filter(j=>j<k&&num(sub.rates[j])!==null).sort((a,b)=>a-b).pop();
      const g=num(sub.rateM)!==null?+sub.rateM:L?+sub.rates[L]:num(sub.rate0);rate={gross:g,base:null,prem:0,kind:g===null?"desconhecida":date<=today&&num(sub.rateM)===null?"estimada":date>today?"hipotetica":"utilizador",ref:null}}
    else{const b=ctx.book(sub.serie,ymOf(prev));rate={gross:b.v===null?null:r3(b.v+pp),base:b.v,prem:pp,kind:b.kind,ref:b.ref}}
    const g=rate.gross===null?0:r2(cap*rate.gross/100*pm/12),tax=r2(g*irs/100),net=r2(g-tax),before=cap;
    cap=r2(cap+net);
    ev.push({k,y,start:prev,date,rate,cap:before,gross:g,tax,net,after:cap,past:date<=today,irs});
    pts.push({d:date,cap,prin,t:"int"});
    flush(addDays(date,1));
    prev=date;
    if(termN&&k===termN){matured={d:date,v:cap};pts.push({d:date,cap:0,prin:0,t:"mat",v:cap});cap=0;prin=0}}
  flush(addDays(today,1));
  return summarize({kind:"caf",R,P0,ev,pts,adj,matured,today,first:ev[0]?ev[0].date:addMonths(start,pm,R.dayRule),redeemAfter:R.redeemAfter||1,start})}

/* ---------- produtos bancários e Certificados do Tesouro ---------- */
/* p = {type, date, amount, rate, rates:[{d,r}], sched:[r1..rn], termM, periodM, basis, cap, early, irs, moves:[{d,a}], projRate} */
function runBank(p,ctx){
  const T=RULES.sav[p.type]||RULES.sav.outro,today=ctx.today,irs=num(p.irs)!==null?+p.irs:(num(ctx.irs)!==null?+ctx.irs:TAX.rate);
  const pm=num(p.periodM)!==null?+p.periodM:T.periodM,termM=num(p.termM)>0?+p.termM:(p.type==="dp"?T.termM:null);
  const basis=p.basis||T.basis,capz=p.cap!==undefined?!!p.cap:T.cap,early=p.early||T.early,start=p.date;
  const until=ctx.until||addMonths(today,12*16,"clamp"),end=termM?addMonths(start,termM,"clamp"):until;
  const P0=+p.amount||0,hist=[{d:start,r:num(p.rate)}].concat((p.rates||[]).filter(x=>x&&x.d&&num(x.r)!==null).map(x=>({d:x.d,r:+x.r}))).sort((a,b)=>a.d.localeCompare(b.d));
  const sched=(p.sched||[]).map(num);
  const rateAt=d=>{if(T.sched||p.type==="ct"){const y=Math.floor(ageYM(start,d).months/12);const v=sched[y];if(v!==null&&v!==undefined)return{r:v,kind:"utilizador"};
      const L=sched.filter(x=>x!==null).pop();return{r:L===undefined?null:L,kind:L===undefined?"desconhecida":"hipotetica"}}
    if(d>today&&num(p.projRate)!==null)return{r:+p.projRate,kind:"hipotetica"};
    let c=null;for(const h of hist)if(h.d<=d)c=h;return{r:c?c.r:null,kind:c===null||c.r===null?"desconhecida":d>today?"hipotetica":"utilizador"}};
  const B=[];if(pm>0){for(let k=1;;k++){const d=addMonths(start,k*pm,"clamp");if(d>=end){B.push(end);break}B.push(d)}}else B.push(end);
  const moves=(p.moves||[]).filter(m=>m&&m.d&&num(m.a)!==null&&m.d>start&&m.d<end).slice().sort((a,b)=>a.d.localeCompare(b.d));
  const rchg=hist.map(h=>h.d).filter(d=>d>start&&d<end);
  let bal=P0,acc=0,t=start,mi=0,lost=0,accToday=null,prev=start,matured=null;const ev=[],pts=[{d:start,cap:bal,prin:P0,t:"sub"}];let prin=P0;
  const seg=to=>{if(to<=t)return;const rr=rateAt(t).r;if(basis!=="per"&&rr!==null){
      if(accToday===null&&t<=today&&to>today)accToday=acc+bal*rr/100*days(t,today)/basis;
      acc+=bal*rr/100*days(t,to)/basis}t=to};
  for(let k=0;k<B.length;k++){const b=B[k],bStart=prev,balStart=bal;
    const stops=[...new Set(moves.filter(m=>m.d>=bStart&&m.d<b).map(m=>m.d).concat(rchg.filter(d=>d>bStart&&d<b)))].sort();
    for(const s of stops){seg(s);while(mi<moves.length&&moves[mi].d===s){const m=moves[mi++],a=+m.a;
        if(a<0&&early==="lose"&&bal>0&&basis!=="per"){const f=Math.min(1,-a/bal),x=acc*f;acc-=x;lost+=x}
        bal=r2(Math.max(0,bal+a));prin=r2(Math.max(0,prin+a));pts.push({d:s,cap:bal,prin,t:a<0?"red":"dep",v:Math.abs(a)})}}
    seg(b);
    const rate=rateAt(bStart),pmEff=pm>0?pm:(termM||12);
    const g=basis==="per"?(rate.r===null?0:r2(balStart*rate.r/100*pmEff/12)):r2(acc),tax=r2(g*irs/100),net=r2(g-tax),before=bal;
    acc=0;if(capz)bal=r2(bal+net);
    ev.push({k:k+1,start:bStart,date:b,rate:{gross:rate.r,kind:rate.kind},cap:before,gross:g,tax,net,after:bal,paid:!capz,past:b<=today,irs});
    pts.push({d:b,cap:bal,prin,t:"int",paid:capz?0:net});
    prev=b;
    if(termM&&b===end){matured={d:b,v:bal};pts.push({d:b,cap:0,prin:0,t:"mat",v:bal});bal=0;prin=0;break}
    if(bal<=0&&mi>=moves.length)break}
  const r=summarize({kind:"sav",R:T,P0,ev,pts,adj:[],matured,today,first:B[0],redeemAfter:T.redeemAfter||0,start});
  r.lost=r2(lost);r.accrued=accToday===null?0:r2(accToday);r.liquid=!!T.liquid;r.early=early;return r}

/* ---------- resumo comum ---------- */
function valueAt(pts,d){let c=null;for(const x of pts){if(x.d<=d)c=x;else break}return c?c.cap:0}
/* valor de hoje + o que já foi reembolsado no fim do prazo (para previsões e simulações) */
function wealthAt(r,d){return r2(valueAt(r.points,d)+(r.matured&&r.matured.d<=d?r.matured.v:0))}
function principalAt(pts,d){let c=null;for(const x of pts){if(x.d<=d)c=x;else break}return c?c.prin:0}
function summarize(o){const{ev,pts,today}=o,past=ev.filter(e=>e.past),fut=ev.filter(e=>!e.past),sum=(L,k)=>r2(L.reduce((a,e)=>a+e[k],0));
  const red=pts.filter(x=>x.t==="red"&&x.d<=today),paidInt=r2(past.filter(e=>e.paid).reduce((a,e)=>a+e.net,0));
  const matPaid=o.matured&&o.matured.d<=today?o.matured.v:0;
  /* fluxos para a taxa interna de rentabilidade (TIR, líquida): entradas negativas, saídas positivas, valor de hoje no fim */
  const flows=[{d:o.start,a:-o.P0}];pts.forEach(x=>{if(x.d>today)return;if(x.t==="dep")flows.push({d:x.d,a:-x.v});if(x.t==="red")flows.push({d:x.d,a:x.v});if(x.t==="mat")flows.push({d:x.d,a:x.v});if(x.paid)flows.push({d:x.d,a:x.paid})});
  const value=valueAt(pts,today),principal=principalAt(pts,today);if(value>0)flows.push({d:today,a:value});
  return{kind:o.kind,rule:o.R,P0:o.P0,events:ev,points:pts,adj:o.adj,
    value,principal,grossToDate:sum(past,"gross"),taxToDate:sum(past,"tax"),netToDate:sum(past,"net"),adjToDate:r2(o.adj.filter(a=>a.d<=today).reduce((s,a)=>s+a.delta,0)),
    received:r2(red.reduce((a,x)=>a+x.v,0)+paidInt+matPaid),paidInterest:paidInt,
    last:past[past.length-1]||null,next:fut[0]||null,matured:o.matured,closed:value<=0&&principal<=0,
    canRedeem:past.length>=o.redeemAfter,redeemFrom:o.first,flows,
    unknownRates:ev.some(e=>e.rate.kind==="desconhecida"),estimated:past.some(e=>e.rate.kind==="estimada")}}

/* ---------- taxa interna de rentabilidade anual (XIRR, base 365) ---------- */
function xirr(flows){const F=(flows||[]).filter(f=>f&&isFinite(f.a)&&f.a!==0);if(F.length<2||!F.some(f=>f.a<0)||!F.some(f=>f.a>0))return null;
  const t0=dnum(F.reduce((a,f)=>f.d<a?f.d:a,F[0].d)),T=F.map(f=>(dnum(f.d)-t0)/365);if(Math.max(...T)<=0)return null;
  const npv=r=>F.reduce((s,f,i)=>s+f.a/Math.pow(1+r,T[i]),0);
  let lo=-.99,hi=1;while(npv(hi)>0&&hi<1e3)hi*=2;if(npv(lo)*npv(hi)>0)return null;
  for(let i=0;i<200;i++){const m=(lo+hi)/2,v=npv(m);if(Math.abs(v)<1e-9)return m;if(npv(lo)*v<0)hi=m;else lo=m}return(lo+hi)/2}

/* ---------- imposto: estimativa do englobamento (hipotética, depende do teu escalão) ---------- */
function englobamento(grossYear,withheld,marginal){const g=+grossYear||0,w=+withheld||0,m=num(marginal);if(m===null)return null;
  const final=r2(g*m/100);return{final,diff:r2(w-final)}}/* diff > 0: a reter a mais (reembolso estimado) */

/* ---------- simulador ---------- */
/* sc = {mode:"cafF"|"rate", P0, monthly, rate, irs, years, start, compM}
   Reforços: um por mês, do mês 1 ao último mês do prazo (12×anos − 1 reforços).
   Modo cafF: cada reforço é uma nova subscrição da Série F, com a sua data, prémios de permanência e trimestres próprios;
   a taxa base hipotética é limitada a 0%–2,50%. Modo rate: um só saldo, juros a 1/12 da taxa por mês, creditados (líquidos) a cada compM meses. */
function simulate(sc){const Y=Math.max(1,Math.min(40,Math.round(+sc.years||1))),start=sc.start,end=addMonths(start,Y*12,"clamp"),irs=num(sc.irs)!==null?+sc.irs:TAX.rate;
  const P0=Math.max(0,+sc.P0||0),M=Math.max(0,+sc.monthly||0),N=Y*12;
  const contrib=[{d:start,a:P0}];for(let m=1;m<N;m++)if(M>0)contrib.push({d:addMonths(start,m,"clamp"),a:M});
  const invested=r2(contrib.reduce((s,c)=>s+c.a,0)),months=Array.from({length:N+1},(_,m)=>addMonths(start,m,"clamp"));
  let gross=0,tax=0,series;
  if(sc.mode==="cafF"){const base=Math.min(2.5,Math.max(0,+sc.rate||0)),book=constBook(base),runs=contrib.filter(c=>c.a>0).map(c=>runCaf({serie:"F",date:c.d,amount:c.a},{today:start,book,irs,until:end}));
    runs.forEach(r=>r.events.forEach(e=>{if(e.date<=end){gross+=e.gross;tax+=e.tax}}));
    series=months.map(d=>({d,value:r2(runs.reduce((s,r)=>s+wealthAt(r,d),0)),inv:r2(contrib.filter(c=>c.d<=d).reduce((s,c)=>s+c.a,0))}));
    const final=r2(runs.reduce((s,r)=>s+wealthAt(r,end),0));gross=r2(gross);tax=r2(tax);
    return{invested,gross,tax,net:r2(gross-tax),final,series,subs:runs.length,base,end,reforcos:contrib.length-1}}
  const r=Math.max(0,+sc.rate||0),cm=Math.max(1,Math.round(+sc.compM||1));let bal=0,acc=0;series=[];
  for(let m=0;m<=N;m++){if(m>0){acc+=bal*r/100/12;if(m%cm===0||m===N){const g=r2(acc),t=r2(g*irs/100);gross+=g;tax+=t;bal=r2(bal+g-t);acc=0}}
    if(m<N){const c=m===0?P0:M;bal=r2(bal+c)}
    series.push({d:months[m],value:bal,inv:r2(m===0?P0:P0+M*Math.min(m,N-1))})}
  series[N].inv=invested;gross=r2(gross);tax=r2(tax);
  return{invested,gross,tax,net:r2(gross-tax),final:bal,series,subs:1,end,reforcos:contrib.length-1}}

/* ---------- integração com o IGCP: interpretar texto da página (colado pelo utilizador ou obtido por fetch) ---------- */
const MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
function parseIgcp(text){const t=String(text||"").replace(/\s+/g," "),out=[];
  const re=/s[ée]rie\s+([A-F])[^.]{0,80}?em\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})[^.]{0,40}?(\d+,\d+)\s*%/gi;
  let m;while((m=re.exec(t))){const mi=MESES.indexOf(m[2].toLowerCase().replace("marco","março"));out.push({serie:m[1].toUpperCase(),ym:m[3]+"-"+pad(mi+1),v:+m[4].replace(",",".")})}
  return out}

const SE={VERSION,RULES,TAX,KIND,r2,r3,addMonths,addDays,ageYM,days,ymOf,premium,euriborAvg,baseFromEuribor,rateBook,constBook,
  cafPrincipal0,runCaf,runBank,valueAt,wealthAt,principalAt,xirr,englobamento,simulate,parseIgcp};
if(typeof module!=="undefined"&&module.exports)module.exports=SE;else root.SE=SE;
})(typeof self!=="undefined"?self:this);
