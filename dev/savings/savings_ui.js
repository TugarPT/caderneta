/* ===================== Poupanças · produtos de aforro (motor: SE) =====================
   Docs: caf  = subscrição de Certificados de Aforro {serie,date,amount,amount0,name,inst,rate0,rates{k},rateM,termY,irs,acct,payAt,note,override,ovDate,realized,soldCost,sales[{d,v,c,g,acct,at}]}
         sav  = outro produto {type:conta|dp|ct|outro,name,inst,date,amount,rate,rates[{d,r}],sched[],termM,periodM,cap,basis,early,irs,acct,payAt,note,moves[{d,a,acct,at}]}
         savcfg (id "savcfg") = {rates:{F:{"AAAA-MM":{v,o,src,at}|{del:true}}},proj:{F,E},tax:{rate,regime,marg}}
         savsim = cenário guardado do simulador
   Nada calculado é guardado: tudo sai do motor em cada render (com cache por versão dos dados). */
const SV_SEED={F:{
  "2026-07":{v:2.356,o:"igcp",src:"IGCP · taxa para julho de 2026 (divulgada em rankia.pt)",at:"2026-11-01"},
  "2026-08":{v:2.474,o:"igcp",src:"IGCP · taxa para agosto de 2026 (divulgada em rankia.pt)",at:"2026-11-01"},
  "2026-09":{v:2.5,o:"igcp",src:"igcp.pt · Certificados de Aforro, setembro de 2026",at:"2026-11-01"}},E:{}};
const SV_T={caf:{n:"Certificados de Aforro",c:"#1f9d6b"},ct:{n:"Certificados do Tesouro",c:"#2f6fd6"},conta:{n:"Conta poupança",c:"#d08a1c"},dp:{n:"Depósito a prazo",c:"#8a62d6"},outro:{n:"Outro produto",c:"#64748b"}};
const SV_KC={oficial:["good","oficial"],derivada:["good","oficial (da F)"],euribor:["good","da Euribor"],registada:["neutral","registada"],utilizador:["neutral","indicada"],estimada:["warn","estimada"],hipotetica:["warn","hipotética"],desconhecida:["bad","sem taxa"]};
const svChip=k=>{const x=SV_KC[k]||SV_KC.desconhecida;return `<span class="chip ${x[0]} sv-k" title="${esc(SE.KIND[k]||"")}">${x[1]}</span>`};
const savs=()=>[...S.items.values()].filter(o=>o.kind==="sav").sort((a,b)=>(a.date||"").localeCompare(b.date||""));
const svPct=(v,d)=>v==null||!isFinite(v)?"—":(+v).toLocaleString("pt-PT",{minimumFractionDigits:d??2,maximumFractionDigits:d??3})+"%";
const svMonth=k=>{const [y,m]=k.split("-");return MLONG?MLONG[+m-1]+" de "+y:k};
const MLONG=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const svName=(d)=>d.kind==="caf"?(d.name||"Certificados de Aforro")+" · Série "+(d.serie||"F"):(d.name||SV_T[d.type||"outro"].n);
const svR2=v=>Math.round(v*100)/100;
const SV={ver:0,c:null,range:(()=>{try{return +localStorage.getItem("caderneta.svRange")||5}catch(e){return 5}})(),cal:12,hist:"all",histN:20,rts:"F",simCache:null};
S.psub=(()=>{try{return localStorage.getItem("caderneta.psub")||""}catch(e){return ""}})();
["putMany","delMany"].forEach(k=>{const f=Store[k].bind(Store);Store[k]=x=>{SV.ver++;return f(x)}});

/* ---------- configuração: taxas oficiais (semente no código + registos do utilizador), cenário e impostos ---------- */
function svCfg(){const d=S.items.get("savcfg")||{},rates={};
  ["F","E"].forEach(s=>{const R=Object.assign({},SV_SEED[s]||{},(d.rates||{})[s]||{});Object.keys(R).forEach(k=>{if(!R[k]||R[k].del)delete R[k]});rates[s]=R});
  const st=settings(),B=st.cafBase!=null&&st.cafBase!==""&&isFinite(+st.cafBase)?+st.cafBase:null;
  return{rates,proj:Object.assign({},d.proj||{}),tax:Object.assign({rate:28,regime:"lib",marg:null},d.tax||{}),
    fallback:B==null?{}:{F:Math.min(2.5,Math.max(0,B)),E:Math.min(3.5,Math.max(0,B+1))}}}
function svPutCfg(fn){const d=Object.assign({id:"savcfg",kind:"savcfg"},JSON.parse(JSON.stringify(S.items.get("savcfg")||{})));fn(d);d.id="savcfg";d.kind="savcfg";return Store.put(d)}
function svAll(){const t=todayISO();if(SV.c&&SV.c.v===SV.ver&&SV.c.items===S.items&&SV.c.t===t)return SV.c;
  const cfg=svCfg(),book=SE.rateBook(cfg,t),ctx={today:t,book,irs:cfg.tax.regime==="isento"?(cfg.tax.rate??0):cfg.tax.rate};
  const run=(doc,fn)=>{try{return{doc,r:fn(doc,ctx)}}catch(e){console.error(e);return null}};
  const caf=cafs().map(c=>run(c,SE.runCaf)).filter(Boolean),sav=savs().map(p=>run(p,SE.runBank)).filter(Boolean),all=caf.concat(sav);
  SV.c={v:SV.ver,items:S.items,t,cfg,book,ctx,caf,sav,all,byId:new Map(all.map(x=>[x.doc.id,x]))};return SV.c}
function svRunOf(doc){const A=svAll(),x=A.byId.get(doc.id);if(x&&x.doc===doc)return x;return{doc,r:doc.kind==="sav"?SE.runBank(doc,A.ctx):SE.runCaf(doc,A.ctx)}}
function svBaseNow(serie){try{const A=svAll(),b=A.book(serie,todayISO().slice(0,7));return b.v}catch(e){return null}}
/* movimentos de dinheiro entre os produtos e as contas (não são receitas nem despesas) */
function svFlows(){const A=svAll();if(A.flows)return A.flows;const t=A.t,out=[],noon=d=>new Date(d+"T12:00:00").getTime();
  const add=(acct,a,d,at)=>{if(acct&&d&&d<=t&&a)out.push({acct,a:svR2(a),d,at:at||noon(d)})};
  A.all.forEach(({doc:o,r})=>{add(o.acct,-r.P0,o.date,o.payAt);
    if(o.kind==="caf")(o.sales||[]).forEach(s=>add(s.acct,+s.v||0,s.d,s.at));
    else{(o.moves||[]).forEach(m=>add(m.acct,-(+m.a||0),m.d,m.at));r.events.forEach(e=>{if(e.past&&e.paid)add(o.acct,e.net,e.date)})}
    if(r.matured)add(o.acct,r.matured.v,r.matured.d)});
  return A.flows=out}
const svFx=a=>svFlows().filter(f=>f.acct===a.id&&f.at>(a.baseAt||0)).reduce((s,f)=>s+f.a,0);
const svSavValue=d=>svAll().sav.reduce((s,x)=>s+SE.valueAt(x.r.points,d),0);
/* património: valor dos produtos que não são Certificados de Aforro (esses já entram como posição em Investimentos) */
nwAt=(f=>function(e,C){const r=f(e,C),t=todayISO();
  try{if(C.ac&&C.ac.length&&e<t){const ids=new Set(C.ac.map(a=>a.id));r.liq-=svFlows().filter(x=>ids.has(x.acct)&&x.d>e&&x.d<=t).reduce((s,x)=>s+x.a,0)}
    r.port+=svSavValue(e<t?e:t)}catch(err){console.error(err)}return r})(nwAt);

/* ---------- agregados ---------- */
function svAgg(){const A=svAll(),t=A.t,L=A.all,q=SE.addMonths(t,-3,"clamp");
  const o={n:L.length,open:L.filter(x=>!x.r.closed),inv:0,sub:0,cap:0,gross:0,tax:0,net:0,adj:0,rec:0,lq:{gross:0,tax:0,net:0},next:null,flows:[]};
  L.forEach(({doc,r})=>{o.inv+=r.principal;o.sub+=r.P0+(doc.moves||[]).filter(m=>+m.a>0&&m.d<=t).reduce((s,m)=>s+ +m.a,0);o.cap+=r.value;o.gross+=r.grossToDate;o.tax+=r.taxToDate;o.net+=r.netToDate;o.adj+=r.adjToDate;o.rec+=r.received;
    r.events.forEach(e=>{if(e.past&&e.date>q){o.lq.gross+=e.gross;o.lq.tax+=e.tax;o.lq.net+=e.net}});
    if(r.next&&(!o.next||r.next.date<o.next.e.date))o.next={e:r.next,doc};o.flows.push(...r.flows)});
  o.irr=SE.xirr(o.flows);return o}
function svNextList(months){const A=svAll(),t=A.t,end=SE.addMonths(t,months,"clamp"),out=[];
  A.all.forEach(({doc,r})=>r.events.forEach(e=>{if(!e.past&&e.date<=end)out.push({doc,e})}));return out.sort((a,b)=>a.e.date.localeCompare(b.e.date))}

/* ---------- gráfico de linhas reutilizável (tooltip com rato, toque e teclado) ---------- */
function svChart(sel,o){const el=$(sel);if(!el)return;const P=o.pts;if(!P||P.length<2){el.innerHTML=`<p class="muted sv-cempty">${o.empty||"Sem dados para o gráfico."}</p>`;return}
  const W=chartW(sel),H=o.h||Math.round(Math.min(280,Math.max(200,W*.32))),L=68,R=12,T=12,B=24,iw=W-L-R,ih=H-T-B,S2=o.series;
  const vals=P.flatMap(p=>S2.map(s=>p[s.k]).filter(v=>v!=null&&isFinite(v)));let mn=Math.min(...vals),mx=Math.max(...vals);const pd=(mx-mn)*.08||mx*.05||1;mn=Math.max(0,mn-pd);mx+=pd;
  const t0=Date.parse(P[0].d),t1=Date.parse(P[P.length-1].d)||t0+1,X=d=>L+iw*(Date.parse(d)-t0)/Math.max(1,t1-t0),Y=v=>T+ih-ih*(v-mn)/(mx-mn);
  const path=(k,f)=>{let s="",on=false;P.forEach(p=>{const v=p[k];if(v==null||!isFinite(v)||(f&&!f(p))){on=false;return}s+=(on?"L":"M")+X(p.d).toFixed(1)+" "+Y(v).toFixed(1);on=true});return s};
  const id="g"+sel.replace(/\W/g,"");let g=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label||"Gráfico")}" tabindex="0">`;
  for(let i=0;i<=3;i++){const v=mn+(mx-mn)*i/3,y=Y(v);g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" style="stroke:var(--line)"/><text x="${L-8}" y="${y+4}" text-anchor="end">${COMPACT.format(v)}</text>`}
  const yrs=(t1-t0)/(365*864e5),lbl=d=>{const [y,m]=d.split("-");return yrs>2.5?y:MSHORT[+m-1]+" "+y.slice(2)};
  [0,.5,1].forEach((f,i)=>{const p=P[Math.round((P.length-1)*f)];g+=`<text x="${X(p.d)}" y="${H-6}" text-anchor="${["start","middle","end"][i]}">${lbl(p.d)}</text>`});
  if(o.split&&o.split>P[0].d&&o.split<P[P.length-1].d){const x=X(o.split);g+=`<rect x="${x}" y="${T}" width="${W-R-x}" height="${ih}" style="fill:var(--surface-2);opacity:.55"/><line x1="${x}" x2="${x}" y1="${T}" y2="${T+ih}" style="stroke:var(--ink-2);stroke-dasharray:2 3"/><text x="${x+6}" y="${T+12}" style="font-size:10px">hoje</text>`}
  g+=`<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--in);stop-opacity:.25"/><stop offset="1" style="stop-color:var(--in);stop-opacity:0"/></linearGradient></defs>`;
  S2.forEach(s=>{if(s.area){const d=path(s.k,s.f);if(d){const ps=P.filter(p=>p[s.k]!=null&&(!s.f||s.f(p)));g+=`<path d="${d} L${X(ps[ps.length-1].d)} ${T+ih} L${X(ps[0].d)} ${T+ih} Z" style="fill:url(#${id})"/>`}}});
  S2.forEach(s=>{const d=path(s.k,s.f);if(d)g+=`<path class="sv-ln" d="${d}" style="fill:none;stroke:${s.c};stroke-width:${s.w||2.2};${s.dash?"stroke-dasharray:"+s.dash+";":""}stroke-linejoin:round;stroke-linecap:round"/>`});
  g+=`<g class="sv-cur" style="display:none"><line y1="${T}" y2="${T+ih}" style="stroke:var(--ink-2);stroke-width:1"/>${S2.map((s,i)=>`<circle r="4" data-i="${i}" style="fill:${s.c};stroke:var(--surface);stroke-width:2"/>`).join("")}</g></svg><div class="sv-tt" hidden></div>`;
  el.innerHTML=g;el.classList.add("sv-chart");const svg=el.querySelector("svg"),cur=el.querySelector(".sv-cur"),tt=el.querySelector(".sv-tt");let at=-1;
  const show=i=>{at=Math.max(0,Math.min(P.length-1,i));const p=P[at],x=X(p.d);cur.style.display="";cur.querySelector("line").setAttribute("x1",x);cur.querySelector("line").setAttribute("x2",x);
    cur.querySelectorAll("circle").forEach(c=>{const s=S2[+c.dataset.i],v=p[s.k];if(v==null||!isFinite(v)){c.style.display="none";return}c.style.display="";c.setAttribute("cx",x);c.setAttribute("cy",Y(v))});
    tt.innerHTML=`<b>${dmy(p.d)}</b>`+S2.filter(s=>p[s.k]!=null&&isFinite(p[s.k])).map(s=>`<span><i style="background:${s.c}"></i>${esc(s.lbl)}<em>${eur(p[s.k])}</em></span>`).join("")+(o.tip?o.tip(p):"");
    tt.hidden=false;const r=svg.getBoundingClientRect(),sc=r.width/W,left=x*sc;tt.style.left=Math.min(Math.max(4,left+12),r.width-tt.offsetWidth-4)+"px";if(left+12+tt.offsetWidth>r.width)tt.style.left=Math.max(4,left-tt.offsetWidth-12)+"px"};
  const hide=()=>{cur.style.display="none";tt.hidden=true};
  const near=ev=>{const r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)*W/r.width;let b=0,bd=1e9;P.forEach((p,i)=>{const d=Math.abs(X(p.d)-x);if(d<bd){bd=d;b=i}});return b};
  svg.addEventListener("pointermove",ev=>show(near(ev)));svg.addEventListener("pointerdown",ev=>show(near(ev)));svg.addEventListener("pointerleave",ev=>{if(ev.pointerType==="mouse")hide()});
  svg.addEventListener("focus",()=>show(at<0?P.length-1:at));svg.addEventListener("blur",hide);
  svg.addEventListener("keydown",ev=>{const st=ev.shiftKey?12:1;if(ev.key==="ArrowRight"){ev.preventDefault();show(at+st)}else if(ev.key==="ArrowLeft"){ev.preventDefault();show(at-st)}else if(ev.key==="Home"){ev.preventDefault();show(0)}else if(ev.key==="End"){ev.preventDefault();show(P.length-1)}else if(ev.key==="Escape")hide()})}

/* ---------- sub-abas ---------- */
const PSUBS=["resumo","produtos","calendario","simulador","taxas","metas"];
function setPsub(k,focus){if(!PSUBS.includes(k))k="resumo";S.psub=k;try{localStorage.setItem("caderneta.psub",k)}catch(e){}
  document.querySelectorAll("#psubs [data-psub]").forEach(b=>{const on=b.dataset.psub===k;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1});
  document.querySelectorAll("#tab-poupancas .psp").forEach(p=>p.hidden=p.dataset.psp!==k);$("#tab-poupancas").dataset.psub=k;
  if(k==="metas")renderGoals();renderSav();if(focus)$("#psub-"+k).focus();$("#psub-"+k).scrollIntoView({block:"nearest",inline:"nearest"})}
$("#psubs").addEventListener("click",e=>{const b=e.target.closest("[data-psub]");if(b)setPsub(b.dataset.psub)});
$("#psubs").addEventListener("keydown",e=>{const B=[...$("#psubs").querySelectorAll("[data-psub]")],i=B.findIndex(b=>b.dataset.psub===S.psub);let n=null;
  if(e.key==="ArrowRight")n=(i+1)%B.length;else if(e.key==="ArrowLeft")n=(i-1+B.length)%B.length;else if(e.key==="Home")n=0;else if(e.key==="End")n=B.length-1;
  if(n!=null){e.preventDefault();setPsub(B[n].dataset.psub,true)}});
document.addEventListener("click",e=>{const g=e.target.closest("[data-psgo]");if(g){setPsub(g.dataset.psgo);document.querySelector("#tab-poupancas").scrollIntoView({block:"start"});return}
  const n=e.target.closest("[data-svnew]");if(n){n.dataset.svnew==="caf"?svOpenCaf(null,n.dataset.svname?{name:n.dataset.svname}:null):svOpenProd(null);return}},false);
/* "Ver todas" das metas no Dashboard abre a sub-aba Metas */
document.addEventListener("click",e=>{if(e.target.closest('[data-go="poupancas"],#goalNew'))setPsub("metas")},true);

function renderSav(){if(!$("#psubs"))return;const A=svAll(),k=S.psub||(A.all.length?"resumo":(goalsCount()?"metas":"resumo"));
  S.psub=PSUBS.includes(k)?k:"resumo";document.querySelectorAll("#tab-poupancas .psp").forEach(p=>p.hidden=p.dataset.psp!==S.psub);document.querySelectorAll("#psubs [data-psub]").forEach(b=>{const on=b.dataset.psub===S.psub;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1});
  $("#tab-poupancas").dataset.psub=S.psub;
  $("#psN").textContent=A.all.filter(x=>!x.r.closed).length||"";$("#pgN").textContent=goalsCount()||"";
  $("#svActs").hidden=S.psub==="metas";if(S.psub!=="metas")$("#poupSub").textContent="Certificados de Aforro, depósitos e outras poupanças: quanto rendem, quando vencem os juros e quanto vai para o IRS.";$("#tab-poupancas .phead [data-gnew]").hidden=S.psub!=="metas";
  if(S.tab!=="poupancas")return;
  try{({resumo:svResumo,produtos:svProdutos,calendario:svCalendario,simulador:svSim,taxas:svTaxas}[S.psub]||(()=>{}))()}catch(e){console.error(e)}}
const goalsCount=()=>[...S.items.values()].filter(o=>o.kind==="goal").length;

/* ---------- Resumo ---------- */
function svRateBanner(){const A=svAll(),cur=A.t.slice(0,7),b=A.book("F",cur),hasF=A.caf.some(x=>(x.doc.serie||"F")==="F"&&!x.r.closed);if(!A.caf.length)return"";
  const ok=b.kind==="oficial"||b.kind==="registada"||b.kind==="euribor";
  return `<div class="sv-rb ${ok?"":"warn"}"><span>Taxa base Série F · ${svMonth(cur)}</span><b class="num">${svPct(b.v)}</b>${svChip(b.kind)}${ok?"":`<small>${b.ref&&b.ref.length===7?"usa a de "+svMonth(b.ref)+" até registares a nova":"sem taxa registada"}${hasF?"":""}</small><button class="link" type="button" data-psgo="taxas">Atualizar →</button>`}</div>`}
function svResumo(){const A=svAll(),has=A.all.length>0;$("#svEmpty").hidden=has;$("#svDash").hidden=!has;if(!has)return;
  const g=svAgg(),t=A.t,irrS=g.irr==null?"—":svPct(g.irr*100,2);
  $("#svCap").textContent=eur(g.cap);
  $("#svCapSub").innerHTML=`${g.open.length} ${g.open.length===1?"produto ativo":"produtos ativos"} · ${A.caf.filter(x=>!x.r.closed).length} ${A.caf.filter(x=>!x.r.closed).length===1?"subscrição":"subscrições"} de Certificados de Aforro`;
  $("#svRateNote").innerHTML=svRateBanner();
  const yrs=SV.range,end=SE.addMonths(t,yrs*12,"clamp"),fut=A.all.reduce((s,x)=>s+SE.wealthAt(x.r,end),0),futMat=A.all.reduce((s,x)=>s+(x.r.matured&&x.r.matured.d>t&&x.r.matured.d<=end?x.r.matured.v:0),0);
  const fe=[];A.all.forEach(x=>x.r.events.forEach(e=>{if(!e.past&&e.date<=end&&!e.paid)fe.push(e)}));
  const fG=fe.reduce((s,e)=>s+e.gross,0),fT=fe.reduce((s,e)=>s+e.tax,0),nx=g.next;
  const K=[
    ["Total investido",eur(g.inv),`capital ainda aplicado${g.sub>g.inv+.005?" · "+eur0(g.sub)+" subscrito ao todo":""}`],
    ["Capital atual",eur(g.cap),`capital + juros líquidos já capitalizados`],
    ["Juros acumulados (líquidos)",`<span style="color:var(--in)">${seur(g.net)}</span>`,`brutos ${eur(g.gross)} · IRS retido ${eur(g.tax)}${Math.abs(g.adj)>=.01?` · acerto AforroNet ${seur(g.adj)}`:""}`],
    ["Juros nos últimos 3 meses",`<span style="color:var(--in)">${seur(g.lq.net)}</span>`,`líquidos · brutos ${eur(g.lq.gross)} · IRS ${eur(g.lq.tax)}`],
    ["Rentabilidade acumulada",g.sub>0?svPct((g.net+g.adj)/g.sub*100,2):"—",`juros líquidos ÷ capital subscrito`],
    ["Rentabilidade anual",irrS,`taxa interna (TIR) líquida, por ano`],
    ["Próxima capitalização",nx?dmy(nx.e.date):"—",nx?`${inDays(nx.e.date)} · ${esc(svName(nx.doc))} · + ${eur(nx.e.net)} líquidos ${nx.e.rate.kind==="hipotetica"||nx.e.rate.kind==="estimada"?"(estimado)":""}`:"sem vencimentos marcados"],
    [`Previsão a ${yrs} ${yrs===1?"ano":"anos"}`,eur(fut),`<span class="chip warn">hipotético</span> + ${eur(fG-fT)} líquidos (brutos ${eur0(fG)}, IRS ${eur0(fT)})${futMat?` · inclui ${eur0(futMat)} reembolsados no fim do prazo`:""}`]];
  $("#svKpis").innerHTML=K.map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span><span class="v num">${k[1]}</span><span class="foot">${k[2]}</span></div>`).join("");
  document.querySelectorAll("#svRange button").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.svr===yrs)));
  const first=A.all.reduce((m,x)=>x.doc.date<m?x.doc.date:m,"9999"),from=[first,SE.addMonths(t,-yrs*12,"clamp")].sort()[1],pts=[];
  const nM=Math.max(2,Math.round((Date.parse(end)-Date.parse(from))/(30.44*864e5))),step=Math.max(1,Math.ceil(nM/180));
  for(let m=0;;m+=step){let d=SE.addMonths(from,m,"clamp");if(d>end)d=end;const p={d,inv:svR2(A.all.reduce((s,x)=>s+SE.principalAt(x.r.points,d),0))},v=svR2(A.all.reduce((s,x)=>s+SE.valueAt(x.r.points,d),0));
    if(d<=t)p.cap=v;if(d>=t)p.proj=v;pts.push(p);if(d>=end)break}
  const ti=pts.findIndex(p=>p.d>t);if(ti>0&&pts[ti-1].d<t){const v=svR2(g.cap);pts.splice(ti,0,{d:t,cap:v,proj:v,inv:svR2(g.inv)})}
  svChart("#svChart",{pts,split:t,label:"Evolução do capital das poupanças",series:[{k:"inv",lbl:"Investido",c:"var(--ink-2)",dash:"4 4",w:1.5},{k:"cap",lbl:"Capital",c:"var(--in)",area:true,w:2.6},{k:"proj",lbl:"Previsão",c:"var(--in)",dash:"6 5",w:2.2}]});
  const pf=A.book("F",SE.addMonths(t,4,"clamp").slice(0,7));
  $("#svChNote").innerHTML=`Até hoje: calculado. Depois de hoje: previsão com taxa base de ${svPct(pf.v)} na Série F (${pf.ref==="cenário"?"o teu cenário":"última conhecida"}), mais os prémios de permanência.`;
  const N=svNextList(12).slice(0,5);
  $("#svNext").innerHTML=N.length?`<div class="sv-list">${N.map(x=>`<button type="button" class="sv-li" data-svdet="${esc(x.doc.id)}"><span class="sv-dt"><b>${x.e.date.slice(8)}</b><small>${MSHORT[+x.e.date.slice(5,7)-1]}</small></span><span class="sv-n"><b>${esc(svName(x.doc))}</b><small>${svPct(x.e.rate.gross)} ${svChip(x.e.rate.kind)}</small></span><span class="sv-a"><b class="num">+ ${eur(x.e.net)}</b><small>bruto ${eur(x.e.gross)} · IRS ${eur(x.e.tax)}</small></span></button>`).join("")}</div>`:`<p class="muted">Sem vencimentos nos próximos 12 meses.</p>`;
  const by={};A.all.forEach(x=>{if(x.r.value<=0)return;const k=x.doc.kind==="caf"?"caf":x.doc.type||"outro";by[k]=(by[k]||0)+x.r.value});const tot=Object.values(by).reduce((a,b)=>a+b,0)||1;
  $("#svMix").innerHTML=Object.keys(by).length?`<div class="sv-mixbar" role="img" aria-label="Distribuição do capital por tipo de produto">${Object.keys(by).map(k=>`<i style="width:${by[k]/tot*100}%;background:${SV_T[k].c}"></i>`).join("")}</div><ul class="sv-mix">${Object.keys(by).sort((a,b)=>by[b]-by[a]).map(k=>`<li><i style="background:${SV_T[k].c}"></i><span>${SV_T[k].n}</span><b class="num">${eur(by[k])}</b><small>${svPct(by[k]/tot*100,1)}</small></li>`).join("")}</ul>`:`<p class="muted">Sem capital aplicado.</p>`}
$("#svRange").addEventListener("click",e=>{const b=e.target.closest("[data-svr]");if(!b)return;SV.range=+b.dataset.svr;try{localStorage.setItem("caderneta.svRange",SV.range)}catch(x){}svResumo()});

/* ---------- Produtos ---------- */
const svAge=d=>{const a=SE.ageYM(d,todayISO());return a.y?`${a.y} ${a.y===1?"ano":"anos"}${a.m?" e "+a.m+" "+(a.m===1?"mês":"meses"):""}`:`${a.m} ${a.m===1?"mês":"meses"}`};
function svCurRate(r){const e=r.next||r.last;return e?e.rate:null}
function svProdutos(){const A=svAll(),box=$("#svProds");
  if(!A.all.length){box.innerHTML=`<div class="card empty"><h2>Ainda sem produtos</h2><p>Começa por registar uma subscrição de Certificados de Aforro ou outro produto de poupança.</p><div class="actions sv-emacts"><button class="btn primary" type="button" data-svnew="caf">+ Certificados de Aforro</button><button class="btn" type="button" data-svnew="sav">+ Outro produto</button></div></div>`;return}
  const groups=new Map();A.caf.forEach(x=>{const k=(x.doc.name||"Certificados de Aforro").trim();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)});
  let h="";
  groups.forEach((L,name)=>{const open=L.filter(x=>!x.r.closed),cap=L.reduce((s,x)=>s+x.r.value,0),net=L.reduce((s,x)=>s+x.r.netToDate,0),gross=L.reduce((s,x)=>s+x.r.grossToDate,0),tax=L.reduce((s,x)=>s+x.r.taxToDate,0),inst=[...new Set(L.map(x=>x.doc.inst).filter(Boolean))].join(", ");
    const nx=open.map(x=>x.r.next).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date))[0];
    h+=`<section class="card sv-grp" aria-label="${esc(name)}"><div class="sv-gh"><span class="sv-ic" style="background:${SV_T.caf.c}" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/></svg></span>
      <div class="sv-gt"><h3>${esc(name)}</h3><p>${SV_T.caf.n}${inst?" · "+esc(inst):""} · ${open.length} ${open.length===1?"subscrição ativa":"subscrições ativas"}</p></div>
      <div class="sv-gv"><b class="num">${eur(cap)}</b><small>juros líquidos ${seur(net)}</small></div>
      <button class="btn" type="button" data-svnew="caf" data-svname="${esc(name)}">+ Subscrição</button></div>
      <div class="sv-gs"><span>Brutos <b class="num">${eur(gross)}</b></span><span>IRS retido <b class="num">${eur(tax)}</b></span><span>Líquidos <b class="num">${eur(net)}</b></span>${nx?`<span>Próximo vencimento <b class="num">${dmy(nx.date)}</b></span>`:""}</div>
      <div class="sv-tablewrap"><table class="sv-table sv-subs"><thead><tr><th scope="col">Subscrição</th><th scope="col">Série</th><th scope="col" class="r">Capital</th><th scope="col">Antiguidade</th><th scope="col" class="r">Taxa atual</th><th scope="col" class="r">Valor atual</th><th scope="col">Próximo vencimento</th><th scope="col"><span class="sr">Ações</span></th></tr></thead><tbody>
      ${L.map(({doc:c,r})=>{const rt=svCurRate(r);return `<tr class="${r.closed?"closed":""}">
        <td data-l="Subscrição"><b class="num">${dmy(c.date)}</b>${c.note?`<small>${esc(c.note)}</small>`:""}</td>
        <td data-l="Série">${esc(c.serie||"F")}</td>
        <td data-l="Capital" class="r num">${eur(r.principal)}${r.P0>r.principal+.005?`<small>de ${eur(r.P0)}</small>`:""}</td>
        <td data-l="Antiguidade">${r.closed?"—":svAge(c.date)}</td>
        <td data-l="Taxa atual" class="r">${rt&&!r.closed?`<span class="num">${svPct(rt.gross)}</span><small>${rt.base!=null?svPct(rt.base)+" + "+svPct(rt.prem,2):""} ${svChip(rt.kind)}</small>`:"—"}</td>
        <td data-l="Valor atual" class="r"><b class="num">${r.closed?(r.matured?"reembolsado":"resgatado"):eur(r.value)}</b>${r.closed?"":`<small style="color:var(--in)">${seur(r.netToDate+r.adjToDate)}</small>`}</td>
        <td data-l="Próximo vencimento">${r.next&&!r.closed?`<span class="num">${dmy(r.next.date)}</span><small>+ ${eur(r.next.net)} líq.</small>`:"—"}</td>
        <td class="sv-acts"><button class="link" type="button" data-svdet="${esc(c.id)}">Detalhe</button>${r.closed?"":`<button class="link" type="button" data-svred="${esc(c.id)}">Resgatar</button>`}<button class="link" type="button" data-svedit="${esc(c.id)}">Editar</button></td></tr>`}).join("")}
      </tbody></table></div></section>`});
  if(A.sav.length){h+=`<section class="card sv-grp"><div class="sv-gh"><div class="sv-gt"><h3>Outros produtos</h3><p>Certificados do Tesouro, contas poupança, depósitos a prazo e outros.</p></div><button class="btn" type="button" data-svnew="sav">+ Produto</button></div><div class="sv-cards">`+
    A.sav.map(({doc:p,r})=>{const T=SV_T[p.type||"outro"],rt=svCurRate(r);return `<article class="sv-pc ${r.closed?"closed":""}"><div class="sv-pch"><span class="sv-ic sm" style="background:${T.c}" aria-hidden="true"></span><div><b>${esc(svName(p))}</b><small>${T.n}${p.inst?" · "+esc(p.inst):""}</small></div></div>
      <div class="sv-pcv"><b class="num">${r.closed?(r.matured?"Terminado":"Levantado"):eur(r.value)}</b><small>${r.closed?"recebido "+eur(r.received):`juros líquidos ${seur(r.netToDate)}${r.accrued?` · ${eur(r.accrued)} a correr (bruto)`:""}`}</small></div>
      <dl class="sv-dl"><div><dt>Taxa</dt><dd>${rt?svPct(rt.gross)+" "+svChip(rt.kind):"—"}</dd></div><div><dt>Desde</dt><dd>${dmy(p.date)}</dd></div>${r.matured?`<div><dt>Fim do prazo</dt><dd>${dmy(r.matured.d)}</dd></div>`:""}<div><dt>Próx. juros</dt><dd>${r.next?dmy(r.next.date)+" · + "+eur(r.next.net):"—"}</dd></div></dl>
      <div class="sv-acts"><button class="link" type="button" data-svdet="${esc(p.id)}">Detalhe</button>${r.closed?"":`<button class="link" type="button" data-svred="${esc(p.id)}">${r.liquid||p.type==="outro"?"Depositar / levantar":"Resgatar"}</button>`}<button class="link" type="button" data-svedit="${esc(p.id)}">Editar</button></div></article>`}).join("")+`</div></section>`}
  else h+=`<div class="card sv-add2"><p>Tens também Certificados do Tesouro, uma conta poupança ou um depósito a prazo?</p><button class="btn" type="button" data-svnew="sav">+ Outro produto</button></div>`;
  const est=A.caf.filter(x=>!x.r.closed&&x.r.estimated).length,unk=A.all.filter(x=>!x.r.closed&&x.r.unknownRates).length;
  if(est||unk)h=`<div class="sv-rb warn sv-info" role="note"><span>${est?`${est} ${est===1?"subscrição tem":"subscrições têm"} vencimentos passados calculados com taxa <b>estimada</b> (meses sem taxa registada).`:""}${unk?` ${unk} ${unk===1?"produto não tem":"produtos não têm"} taxa para alguns trimestres.`:""} Para valores exatos, regista as taxas desses meses em Taxas, corrige a taxa de cada trimestre no Detalhe, ou escreve o valor atual do AforroNet em Editar.</span><button class="link" type="button" data-psgo="taxas">Taxas →</button></div>`+h;
  box.innerHTML=h}
document.addEventListener("click",e=>{const d=e.target.closest("[data-svdet]");if(d){svOpenDet(d.dataset.svdet);return}
  const r=e.target.closest("[data-svred]");if(r){const o=S.items.get(r.dataset.svred);if(o)svOpenRed(o);return}
  const ed=e.target.closest("[data-svedit]");if(ed){const o=S.items.get(ed.dataset.svedit);if(o)o.kind==="caf"?svOpenCaf(o):svOpenProd(o);return}
  const q=e.target.closest("[data-svq]");if(q){svOpenQ(q.dataset.svq,+q.dataset.k)}});

/* ---------- Calendário, histórico, anos, resgates ---------- */
function svCalendario(){const A=svAll();document.querySelectorAll("#svCalN button").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.svc===SV.cal)));
  const L=svNextList(SV.cal);
  if(!L.length)$("#svCal").innerHTML=`<p class="muted">${A.all.length?"Sem vencimentos neste período.":"Ainda sem produtos: os vencimentos aparecem aqui."}</p>`;
  else{const by=new Map();L.forEach(x=>{const k=x.e.date.slice(0,7);if(!by.has(k))by.set(k,[]);by.get(k).push(x)});
    $("#svCal").innerHTML=`<div class="sv-cal">${[...by].map(([k,X])=>{const G=X.reduce((s,x)=>s+x.e.gross,0),T=X.reduce((s,x)=>s+x.e.tax,0);return `<div class="sv-cm"><div class="sv-cmh"><h4>${svMonth(k)}</h4><span class="num">+ ${eur(G-T)} <small>líquidos · brutos ${eur(G)} · IRS ${eur(T)}</small></span></div>
      ${X.map(x=>`<button type="button" class="sv-li" data-svdet="${esc(x.doc.id)}"><span class="sv-dt"><b>${x.e.date.slice(8)}</b><small>${MSHORT[+x.e.date.slice(5,7)-1]}</small></span><span class="sv-n"><b>${esc(svName(x.doc))}</b><small>${x.doc.kind==="caf"?"subscrição de "+dmy(x.doc.date)+" · ano "+x.e.y+" · ":""}${svPct(x.e.rate.gross)} ${svChip(x.e.rate.kind)}</small></span><span class="sv-a"><b class="num">+ ${eur(x.e.net)}</b><small>bruto ${eur(x.e.gross)} · IRS ${eur(x.e.tax)}${x.e.paid?" · pago à conta":""}</small></span></button>`).join("")}</div>`}).join("")}</div>`}
  const sel=$("#svHistF"),opts=`<option value="all">Todos</option>`+A.all.map(x=>`<option value="${esc(x.doc.id)}">${esc(svName(x.doc))}${x.doc.kind==="caf"?" · "+dmy(x.doc.date):""}</option>`).join("");
  if(sel.dataset.o!==opts){sel.innerHTML=opts;sel.dataset.o=opts}if(![...sel.options].some(o=>o.value===SV.hist))SV.hist="all";sel.value=SV.hist;
  const H=[];A.all.forEach(x=>{if(SV.hist!=="all"&&x.doc.id!==SV.hist)return;x.r.events.forEach(e=>{if(e.past)H.push({doc:x.doc,e})})});H.sort((a,b)=>b.e.date.localeCompare(a.e.date));
  $("#svHist").innerHTML=H.length?`<div class="sv-tablewrap"><table class="sv-table sv-hist"><thead><tr><th scope="col">Data</th><th scope="col">Produto</th><th scope="col" class="r">Taxa</th><th scope="col" class="r">Capital antes</th><th scope="col" class="r">Bruto</th><th scope="col" class="r">IRS</th><th scope="col" class="r">Líquido</th><th scope="col" class="r">Capital depois</th></tr></thead><tbody>
    ${H.slice(0,SV.histN).map(({doc,e})=>`<tr><td data-l="Data" class="num">${dmy(e.date)}</td><td data-l="Produto">${esc(svName(doc))}${doc.kind==="caf"?`<small>subscrição ${dmy(doc.date)}</small>`:""}</td><td data-l="Taxa" class="r"><span class="num">${svPct(e.rate.gross)}</span> ${svChip(e.rate.kind)}</td><td data-l="Capital antes" class="r num">${eur(e.cap)}</td><td data-l="Bruto" class="r num">${eur(e.gross)}</td><td data-l="IRS" class="r num">− ${eur(e.tax)}</td><td data-l="Líquido" class="r num" style="color:var(--in)">+ ${eur(e.net)}</td><td data-l="Capital depois" class="r num"><b>${eur(e.after)}</b>${e.paid?"<small>juros pagos à conta</small>":""}</td></tr>`).join("")}</tbody></table></div>
    ${H.length>SV.histN?`<button class="link more" type="button" id="svHistMore">Ver mais ${Math.min(20,H.length-SV.histN)} (de ${H.length-SV.histN})</button>`:""}`:`<p class="muted">Ainda nenhum vencimento passado.</p>`;
  const Y={};A.all.forEach(x=>x.r.events.forEach(e=>{if(!e.past)return;const y=e.date.slice(0,4);Y[y]=Y[y]||{g:0,t:0,n:0};Y[y].g+=e.gross;Y[y].t+=e.tax;Y[y].n+=e.net}));
  const tx=A.cfg.tax,eng=tx.regime==="eng"&&tx.marg!=null&&tx.marg!=="";
  $("#svYears").innerHTML=Object.keys(Y).length?`<div class="sv-tablewrap"><table class="sv-table"><thead><tr><th scope="col">Ano</th><th scope="col" class="r">Brutos</th><th scope="col" class="r">IRS retido</th><th scope="col" class="r">Líquidos</th>${eng?`<th scope="col" class="r">Englobamento (estim.)</th>`:""}</tr></thead><tbody>${Object.keys(Y).sort().reverse().map(y=>{const v=Y[y],en=eng?SE.englobamento(v.g,v.t,+tx.marg):null;return `<tr><td data-l="Ano"><b>${y}</b></td><td data-l="Brutos" class="r num">${eur(v.g)}</td><td data-l="IRS retido" class="r num">${eur(v.t)}</td><td data-l="Líquidos" class="r num">${eur(v.n)}</td>${en?`<td data-l="Englobamento" class="r num">${en.diff>=0?"recebes ≈ "+eur(en.diff):"pagas ≈ "+eur(-en.diff)}</td>`:""}</tr>`}).join("")}</tbody></table></div>${eng?`<p class="note">Englobamento: estimativa com a taxa marginal de ${svPct(+tx.marg,1)}. O valor final depende da tua declaração completa.</p>`:""}`:`<p class="muted">Sem juros vencidos ainda.</p>`;
  const R=[];A.all.forEach(({doc})=>{if(doc.kind==="caf")(doc.sales||[]).forEach(s=>R.push({doc,d:s.d,v:+s.v,c:+s.c,g:+s.g,acct:s.acct}));else(doc.moves||[]).forEach(m=>R.push({doc,d:m.d,v:-(+m.a),acct:m.acct,mv:true}))});R.sort((a,b)=>b.d.localeCompare(a.d));
  const an=id=>{const a=id&&S.items.get(id);return a?a.name:""};
  $("#svReds").innerHTML=R.length?`<div class="sv-list">${R.map(x=>`<div class="sv-li st"><span class="sv-dt"><b>${x.d.slice(8)}</b><small>${MSHORT[+x.d.slice(5,7)-1]} ${x.d.slice(2,4)}</small></span><span class="sv-n"><b>${esc(svName(x.doc))}</b><small>${x.mv?(x.v>0?"Levantamento":"Depósito"):"Resgate"}${x.acct&&an(x.acct)?(x.v>0?" → ":" ← ")+esc(an(x.acct)):""}</small></span><span class="sv-a"><b class="num">${x.v>0?"+ ":"− "}${eur(Math.abs(x.v))}</b>${x.mv?"":`<small>capital ${eur(x.c)} · juros ${eur(x.g)}</small>`}</span></div>`).join("")}</div>`:`<p class="muted">Sem resgates registados.</p>`}
$("#svCalN").addEventListener("click",e=>{const b=e.target.closest("[data-svc]");if(b){SV.cal=+b.dataset.svc;svCalendario()}});
$("#svHistF").addEventListener("change",e=>{SV.hist=e.target.value;SV.histN=20;svCalendario()});
$("#svHist").addEventListener("click",e=>{if(e.target.closest("#svHistMore")){SV.histN+=20;svCalendario()}});

/* ---------- Simulador ---------- */
const SV_EX={mode:"cafF",P0:"5000",M:"200",R:"2,5",irs:"28",Y:"10",C:"3"};
function svSimRead(){const g=id=>$(id).value,mode=g("#svSimMode");
  return{mode,P0:parseNum(g("#svSimP0")),monthly:g("#svSimM").trim()?parseNum(g("#svSimM")):0,rate:parseNum(g("#svSimR")),irs:parseNum(g("#svSimIrs")),years:+g("#svSimY"),start:g("#svSimStart")||todayISO(),compM:+g("#svSimC")}}
function svSimValid(s){if(!(s.P0>=0))return"Indica o capital inicial (pode ser 0).";if(!(s.monthly>=0))return"O reforço mensal não é válido.";if(!(s.P0>0||s.monthly>0))return"Indica um capital inicial ou um reforço mensal.";
  if(!(s.rate>=0&&s.rate<=20))return"Indica a taxa em %, entre 0 e 20.";if(!(s.irs>=0&&s.irs<=100))return"O IRS deve estar entre 0 e 100%.";if(!(s.years>=1&&s.years<=40))return"A duração vai de 1 a 40 anos.";
  if(s.mode==="cafF"&&s.years>15)return"Os Certificados de Aforro Série F têm prazo de 15 anos.";if(s.mode==="cafF"&&(s.P0>0&&s.P0<10||s.monthly>0&&s.monthly<10))return"Na Série F cada subscrição tem de ter pelo menos 10 € (10 unidades).";return""}
const svSimLbl=s=>`${s.mode==="cafF"?"Aforro F":"Taxa fixa"} · ${eur0(s.P0)}${s.monthly?" + "+eur0(s.monthly)+"/mês":""} · ${svPct(s.mode==="cafF"?Math.min(2.5,s.rate):s.rate,2)} · ${s.years} ${s.years===1?"ano":"anos"}`;
function svSim(){const s=svSimRead(),cf=s.mode==="cafF";$("#svSimRL").firstChild.textContent=cf?"Taxa base hipotética (%)":"Taxa anual hipotética (TANB, %)";$("#svSimCL").hidden=cf;
  $("#svSimHelp").textContent=cf?"Cada reforço mensal entra como uma nova subscrição, com a sua data, os seus trimestres e os seus prémios de permanência (somados à taxa base). A taxa base fica entre 0% e 2,50%.":"Um único saldo: os juros contam todos os meses (taxa ÷ 12) e são creditados, já sem IRS, na periodicidade escolhida.";
  const err=svSimValid(s);$("#svSimErr").hidden=!err;$("#svSimErr").textContent=err;if(err){$("#svSimOut").innerHTML="";$("#svSimChart").innerHTML="";return}
  if(cf&&s.rate>2.5){$("#svSimErr").hidden=false;$("#svSimErr").textContent="Na Série F a taxa base não passa de 2,50%: a simulação usa 2,50% (mais os prémios)."}
  const key=JSON.stringify(s);let r=SV.simCache&&SV.simCache.k===key?SV.simCache.r:null;if(!r){r=SE.simulate(s);SV.simCache={k:key,r}}
  $("#svSimEnd").textContent=`${dmy(s.start)} → ${dmy(r.end)} · ${r.reforcos} reforços${cf?" · "+r.subs+" subscrições":""}`;
  $("#svSimOut").innerHTML=[["Total investido",eur(r.invested),""],["Juros brutos",eur(r.gross),""],["IRS",`− ${eur(r.tax)}`,"bad"],["Juros líquidos",`+ ${eur(r.net)}`,"good"],["Valor final",eur(r.final),"fin"]].map(x=>`<div class="sv-tile ${x[2]}"><span>${x[0]}</span><b class="num">${x[1]}</b></div>`).join("");
  svChart("#svSimChart",{pts:r.series.map(p=>({d:p.d,v:p.value,inv:p.inv})),label:"Crescimento simulado",series:[{k:"inv",lbl:"Investido",c:"var(--ink-2)",dash:"4 4",w:1.5},{k:"v",lbl:"Valor",c:"var(--accent)",area:false,w:2.6}]});
  svCmp()}
const SV_COLS=["#1f9d6b","#2f6fd6","#d08a1c","#8a62d6","#cc3b46","#0e9aa7"];
function svCmp(){const L=[...S.items.values()].filter(o=>o.kind==="savsim").sort((a,b)=>(a.at||0)-(b.at||0)).slice(0,6);$("#svCmpCard").hidden=!L.length;if(!L.length)return;
  const R=L.map(o=>({o,r:SE.simulate(o.sc)})),rows=[["Total investido","invested"],["Juros brutos","gross"],["IRS","tax"],["Juros líquidos","net"],["Valor final","final"]],best=Math.max(...R.map(x=>x.r.final));
  $("#svCmp").innerHTML=`<thead><tr><th scope="col"><span class="sr">Cenário</span></th>${R.map((x,i)=>`<th scope="col"><span class="sv-cdot" style="background:${SV_COLS[i]}"></span>${esc(svSimLbl(x.o.sc))}<button class="link sv-cx" type="button" data-svsimdel="${esc(x.o.id)}" aria-label="Apagar cenário ${i+1}">Apagar</button></th>`).join("")}</tr></thead><tbody>${rows.map(([l,k])=>`<tr><th scope="row">${l}</th>${R.map(x=>`<td class="r num ${k==="final"&&x.r.final===best&&R.length>1?"sv-best":""}">${k==="tax"?"− ":""}${eur(x.r[k])}</td>`).join("")}</tr>`).join("")}<tr><th scope="row">IRS usado</th>${R.map(x=>`<td class="r num">${svPct(x.o.sc.irs,0)}</td>`).join("")}</tr></tbody>`;
  const maxN=Math.max(...R.map(x=>x.r.series.length)),longest=R.find(x=>x.r.series.length===maxN).r.series,pts=longest.map((p,m)=>{const o={d:p.d};R.forEach((x,i)=>{const q=x.r.series[m];if(q)o["s"+i]=q.value});return o});
  svChart("#svCmpChart",{pts,label:"Comparação de cenários",series:R.map((x,i)=>({k:"s"+i,lbl:"Cenário "+(i+1),c:SV_COLS[i],w:2.2}))})}
["#svSimMode","#svSimP0","#svSimM","#svSimR","#svSimIrs","#svSimY","#svSimStart","#svSimC"].forEach(id=>$(id).addEventListener("input",()=>{clearTimeout(SV.simT);SV.simT=setTimeout(svSim,180)}));
$("#svSimForm").addEventListener("submit",e=>{e.preventDefault();const s=svSimRead(),err=svSimValid(s);if(err){toast(err);return}
  const L=[...S.items.values()].filter(o=>o.kind==="savsim");if(L.length>=6){toast("Já tens 6 cenários. Apaga um para guardar outro.");return}
  Store.put({id:newId("ss"),kind:"savsim",sc:s,at:Date.now()});toast("Cenário guardado para comparar")});
$("#svSimReset").onclick=()=>{$("#svSimMode").value=SV_EX.mode;$("#svSimP0").value=SV_EX.P0;$("#svSimM").value=SV_EX.M;$("#svSimR").value=SV_EX.R;$("#svSimIrs").value=String(svCfg().tax.rate).replace(".",",");$("#svSimY").value=SV_EX.Y;$("#svSimC").value=SV_EX.C;$("#svSimStart").value=todayISO();svSim()};
$("#svCmp").addEventListener("click",e=>{const b=e.target.closest("[data-svsimdel]");if(b){Store.del(b.dataset.svsimdel);toast("Cenário apagado")}});
$("#svSimStart").value=todayISO();

/* ---------- Taxas e impostos ---------- */
function svTaxas(){const A=svAll(),s=SV.rts,T=A.cfg.rates[s]||{},R=SE.RULES.caf[s],cur=A.t.slice(0,7);
  document.querySelectorAll("#svRtSerie button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.svs===s)));
  $("#svRtHelp").textContent=`${R.name}: taxa base = média da Euribor a 3 meses dos ${R.base.days} dias úteis anteriores${R.base.spread?" + "+svPct(R.base.spread,0):""}, arredondada à 3.ª casa decimal, entre ${svPct(R.base.min,0)} e ${svPct(R.base.max,2)}. É fixada no ${R.base.fixed}. Cada trimestre usa a taxa do mês em que começa.`;
  const keys=Object.keys(T).sort().reverse(),nowB=A.book(s,cur);
  $("#svRtTable").innerHTML=`<div class="sv-rnow ${["oficial","registada","euribor"].includes(nowB.kind)?"":"warn"}"><span>Este mês (${svMonth(cur)})</span><b class="num">${svPct(nowB.v)}</b>${svChip(nowB.kind)}${nowB.kind==="estimada"?`<small>ainda sem taxa registada: usa a de ${nowB.ref&&nowB.ref.length===7?svMonth(nowB.ref):"omissão"}</small>`:""}</div>`+
    (keys.length?`<div class="sv-tablewrap"><table class="sv-table sv-rt"><thead><tr><th scope="col">Mês</th><th scope="col" class="r">Taxa base</th><th scope="col">Origem</th><th scope="col">Fonte</th><th scope="col"><span class="sr">Ações</span></th></tr></thead><tbody>${keys.map(k=>{const x=T[k],kd=x.o==="igcp"?"oficial":x.o==="euribor"?"euribor":"registada";return `<tr><td data-l="Mês"><b>${svMonth(k)}</b></td><td data-l="Taxa base" class="r num">${svPct(x.v)}</td><td data-l="Origem">${svChip(kd)}</td><td data-l="Fonte"><small>${esc(x.src||"—")}${x.at?" · registado a "+dmy(x.at):""}</small></td><td class="sv-acts"><button class="link" type="button" data-svrte="${k}">Editar</button><button class="link sv-del" type="button" data-svrtd="${k}">Apagar</button></td></tr>`}).join("")}</tbody></table></div>`:`<p class="muted">Ainda sem taxas registadas para a ${R.name}. Sem taxa, a app não calcula juros dessa série: regista pelo menos a do mês atual.</p>`);
  const pr=A.cfg.proj;["F","E"].forEach(x=>{const el=$("#svProj"+x);if(document.activeElement!==el)el.value=pr[x]==null||pr[x]===""?"":numStr(pr[x])});
  const tx=A.cfg.tax;if(document.activeElement!==$("#svTaxRate"))$("#svTaxRate").value=numStr(tx.rate);$("#svTaxReg").value=tx.regime;if(document.activeElement!==$("#svTaxMarg"))$("#svTaxMarg").value=tx.marg==null?"":numStr(tx.marg);
  $("#svTaxMargL").hidden=tx.regime!=="eng";
  $("#svTaxNote").textContent=tx.regime==="lib"?"Taxa liberatória: o IRS retido em cada vencimento (28% para residentes) é o imposto final. Não precisas de declarar estes juros.":tx.regime==="eng"?"Englobamento: a retenção continua a ser feita em cada vencimento, mas conta como pagamento por conta. Na declaração, os juros somam-se aos outros rendimentos e pagam à taxa do teu escalão. Em Calendário → Juros por ano vês uma estimativa da diferença.":"Usa a taxa indicada acima (por exemplo, 0% se não há retenção). Confirma a tua situação com a Autoridade Tributária.";
  const pp=r=>r.prem.map(p=>`ano${p.from===p.to?"":"s"} ${p.from}${p.to!==p.from?" a "+p.to:""}: +${svPct(p.pp,2)}`).join(" · ");
  $("#svRules").innerHTML=`<div class="sv-tablewrap"><table class="sv-table sv-rules"><thead><tr><th scope="col">Produto</th><th scope="col">Taxa</th><th scope="col">Prémios de permanência</th><th scope="col">Juros</th><th scope="col">Resgate</th><th scope="col">Fonte</th></tr></thead><tbody>${["F","E"].map(k=>{const r=SE.RULES.caf[k];return `<tr><td data-l="Produto"><b>Aforro ${r.name}</b><small>prazo ${r.termY} anos${r.active?"":" · subscrições encerradas"}</small></td><td data-l="Taxa">Euribor 3M (média de ${r.base.days} dias úteis)${r.base.spread?" + "+svPct(r.base.spread,0):""}, entre ${svPct(r.base.min,0)} e ${svPct(r.base.max,2)}</td><td data-l="Prémios">${pp(r)}</td><td data-l="Juros">de 3 em 3 meses, no dia da subscrição (se não existir, dia 1 do mês seguinte); líquidos de IRS, somados ao capital</td><td data-l="Resgate">total ou parcial a partir do 1.º vencimento; perde os juros do trimestre em curso</td><td data-l="Fonte"><a href="${r.src.url}" target="_blank" rel="noopener">${esc(r.src.label)}</a><small>consultado a ${dmy(r.src.checked)}</small></td></tr>`}).join("")}
    <tr><td data-l="Produto"><b>Aforro Séries A, B, C e D</b></td><td data-l="Taxa" colspan="5">Regras não carregadas na app: indicas a taxa bruta de cada trimestre (vês no AforroNet). Juros de 3 em 3 meses, líquidos de IRS, somados ao capital.</td></tr>
    <tr><td data-l="Produto"><b>Certificados do Tesouro</b></td><td data-l="Taxa" colspan="5">Indicas a taxa bruta de cada ano, como está na ficha técnica da tua série. Juros pagos uma vez por ano (não capitalizam).</td></tr>
    <tr><td data-l="Produto"><b>Contas poupança, depósitos e outros</b></td><td data-l="Taxa" colspan="5">TANB, prazo, periodicidade, contagem de dias e regra de mobilização antecipada do teu contrato. Podes registar mudanças de taxa no detalhe do produto.</td></tr></tbody></table></div>`}
$("#svRtSerie").addEventListener("click",e=>{const b=e.target.closest("[data-svs]");if(b){SV.rts=b.dataset.svs;svTaxas()}});
const svProjSave=s=>{const raw=$("#svProj"+s).value.trim(),v=raw?parseNum(raw):null;const R=SE.RULES.caf[s];
  if(raw&&!(v>=R.base.min&&v<=R.base.max)){toast(`A taxa base da ${R.name} fica entre ${svPct(R.base.min,0)} e ${svPct(R.base.max,2)}`);return}
  svPutCfg(d=>{d.proj=d.proj||{};if(v==null)delete d.proj[s];else d.proj[s]=v});toast("Cenário guardado")};
$("#svProjF").addEventListener("change",()=>svProjSave("F"));$("#svProjE").addEventListener("change",()=>svProjSave("E"));
const svTaxSave=()=>{const r=parseNum($("#svTaxRate").value),m=$("#svTaxMarg").value.trim()?parseNum($("#svTaxMarg").value):null;
  if(!(r>=0&&r<=100)){toast("A taxa de IRS fica entre 0 e 100%");return}if(m!=null&&!(m>=0&&m<=100)){toast("A taxa marginal fica entre 0 e 100%");return}
  svPutCfg(d=>{d.tax={rate:r,regime:$("#svTaxReg").value,marg:m}});toast("Impostos guardados")};
["#svTaxRate","#svTaxReg","#svTaxMarg"].forEach(id=>$(id).addEventListener("change",svTaxSave));
$("#svRtTable").addEventListener("click",e=>{const ed=e.target.closest("[data-svrte]");if(ed){svOpenRt(SV.rts,ed.dataset.svrte);return}
  const dl=e.target.closest("[data-svrtd]");if(dl){const k=dl.dataset.svrtd;if(!dl.dataset.sure){dl.dataset.sure="1";dl.textContent="Confirmar";setTimeout(()=>{delete dl.dataset.sure;dl.textContent="Apagar"},4000);return}
    svPutCfg(d=>{d.rates=d.rates||{};d.rates[SV.rts]=d.rates[SV.rts]||{};d.rates[SV.rts][k]=SV_SEED[SV.rts]&&SV_SEED[SV.rts][k]?{del:true}:undefined;if(d.rates[SV.rts][k]===undefined)delete d.rates[SV.rts][k]});toast("Taxa apagada")}});
$("#svRtAdd").onclick=()=>svOpenRt(SV.rts,null);
/* integração IGCP: a página oficial não permite leitura direta a partir do navegador (CORS); tenta e, se falhar, explica e abre o registo manual */
const SV_IGCP={url:"https://www.igcp.pt/pt/aforristas/produtos-de-aforro/certificados-de-aforro",proxy:null};
$("#svRtFetch").onclick=async()=>{const b=$("#svRtFetch"),msg=$("#svRtMsg");b.disabled=true;b.textContent="A procurar…";msg.textContent="";
  try{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),8000),res=await fetch(SV_IGCP.proxy?SV_IGCP.proxy+encodeURIComponent(SV_IGCP.url):SV_IGCP.url,{signal:ctl.signal,cache:"no-store"});clearTimeout(tm);
    if(!res.ok)throw new Error("http "+res.status);const txt=(await res.text()).replace(/<[^>]+>/g," "),L=SE.parseIgcp(txt);if(!L.length)throw new Error("sem taxa no texto");
    await svPutCfg(d=>{d.rates=d.rates||{};L.forEach(x=>{d.rates[x.serie]=d.rates[x.serie]||{};d.rates[x.serie][x.ym]={v:x.v,o:"igcp",src:"igcp.pt (atualização automática)",at:todayISO()}})});
    msg.textContent=L.map(x=>`Série ${x.serie}, ${svMonth(x.ym)}: ${svPct(x.v)}`).join(" · ")+" — guardado."}
  catch(e){msg.innerHTML=`Não foi possível ler o site do IGCP a partir da app (o site não deixa outras páginas lerem os dados). Abre a página do IGCP, copia a frase da taxa e usa <b>+ Registar taxa → Colar do IGCP</b>.`}
  finally{b.disabled=false;b.textContent="Atualizar do IGCP"}};

/* ---------- diálogo: registar taxa base ---------- */
function svOpenRt(serie,month){const T=svCfg().rates[serie]||{},x=month&&T[month];S.svRtHow="v";svRtHow();
  $("#svRtTitle").textContent=month?"Editar taxa base":"Registar taxa base";$("#svRtSer").value=serie;$("#svRtMonth").value=month||todayISO().slice(0,7);
  $("#svRtVal").value=x?numStr(x.v):"";$("#svRtSrc").value=x?x.src||"":"";$("#svRtEur").value="";$("#svRtPaste").value="";$("#svRtErr").hidden=true;svRtPrev();$("#svRtDlg").showModal();$("#svRtVal").focus()}
function svRtHow(){document.querySelectorAll("#svRtHow button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.svh===S.svRtHow)));document.querySelectorAll("[data-svhp]").forEach(p=>p.hidden=p.dataset.svhp!==S.svRtHow)}
function svRtCalc(){const s=$("#svRtSer").value;if(S.svRtHow==="v"){const v=parseNum($("#svRtVal").value);return isFinite(v)?{v,o:"user"}:null}
  if(S.svRtHow==="eur"){const vals=$("#svRtEur").value.split(/[\n;]+/).map(x=>x.trim()).filter(Boolean).map(parseNum);if(!vals.length||vals.some(x=>!isFinite(x)))return null;const avg=SE.euriborAvg(vals);return{v:SE.baseFromEuribor(s,avg),o:"euribor",avg,n:vals.length}}
  const L=SE.parseIgcp($("#svRtPaste").value);return L.length?Object.assign({o:"igcp"},L[0]):null}
function svRtPrev(){const c=svRtCalc(),p=$("#svRtPrev");if(!c){p.innerHTML="";return}
  if(c.o==="euribor")p.innerHTML=`Média de ${c.n} ${c.n===1?"valor":"valores"}: <b class="num">${svPct(c.avg)}</b> → taxa base <b class="num">${svPct(c.v)}</b>${c.n!==10?` <span class="chip warn">a regra usa 10 dias úteis</span>`:""}`;
  else if(c.o==="igcp")p.innerHTML=`Encontrado: Série ${c.serie}, ${svMonth(c.ym)}: <b class="num">${svPct(c.v)}</b>`;else p.innerHTML=""}
$("#svRtHow").addEventListener("click",e=>{const b=e.target.closest("[data-svh]");if(b){S.svRtHow=b.dataset.svh;svRtHow();svRtPrev()}});
["#svRtVal","#svRtEur","#svRtPaste","#svRtSer"].forEach(id=>$(id).addEventListener("input",svRtPrev));
$("#svRtForm").addEventListener("submit",e=>{e.preventDefault();const c=svRtCalc(),err=m=>{$("#svRtErr").textContent=m;$("#svRtErr").hidden=false};
  if(!c)return err(S.svRtHow==="paste"?"Não encontrei a taxa no texto. Copia a frase “A taxa de juro bruta … foi fixada em X%”.":S.svRtHow==="eur"?"Escreve os valores da Euribor, um por linha.":"Indica a taxa base em %.");
  const s=c.serie||$("#svRtSer").value,m=c.ym||$("#svRtMonth").value,R=SE.RULES.caf[s];
  if(!/^\d{4}-\d{2}$/.test(m))return err("Indica o mês.");
  if(!(c.v>=R.base.min&&c.v<=R.base.max))return err(`A taxa base da ${R.name} fica entre ${svPct(R.base.min,0)} e ${svPct(R.base.max,2)}.`);
  const src=$("#svRtSrc").value.trim()||(c.o==="euribor"?"calculada da Euribor indicada":c.o==="igcp"?"texto do igcp.pt":"registada por ti");
  svPutCfg(d=>{d.rates=d.rates||{};d.rates[s]=d.rates[s]||{};d.rates[s][m]={v:SE.r3(c.v),o:c.o,src,at:todayISO()}});
  $("#svRtDlg").close();SV.rts=s;toast(`Taxa base de ${svMonth(m)} guardada`)});

/* ---------- diálogo: subscrição de Certificados de Aforro ---------- */
function svAcctOpts(sel,cur){const A=accts().filter(a=>a.type!=="Corretora");$(sel).innerHTML=`<option value="">Nenhuma</option>`+A.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");$(sel).value=cur&&A.some(a=>a.id===cur)?cur:""}
function svCafSerie(){const s=$("#svCSerie").value,R=SE.RULES.caf[s],man=!!R.manual;$("#svCManW").hidden=!man;$("#svCRate0L").hidden=man;
  const d=$("#svCDate").value,b=d&&!man?svAll().book(s,d.slice(0,7)):null;$("#svCRate0").placeholder=b&&b.v!=null?svPct(b.v)+" ("+(SV_KC[b.kind]||[0,""])[1]+")":"da tabela";
  $("#svCHelp").innerHTML=man?`As regras da ${R.name} não estão carregadas na app. Indica a taxa bruta atual (vês no AforroNet); podes corrigir a de cada trimestre no detalhe.`:`${R.name}: juros de 3 em 3 meses a contar da data da subscrição, prémios de permanência a partir do 2.º ano. A taxa inicial é opcional: se a deixares vazia, a app usa a taxa base do mês da subscrição.`+(s==="E"?" A Série E já não aceita novas subscrições: regista só as antigas.":"")}
function svOpenCaf(c,pre){S.svEdit=c?c.id:null;$("#svCafTitle").textContent=c?"Editar subscrição":"Nova subscrição";$("#svCSubmit").textContent=c?"Guardar":"Adicionar";$("#svCDel").hidden=!c;
  const x=c||Object.assign({serie:"F",date:todayISO()},pre||{}),cfg=svCfg();
  $("#svCNames").innerHTML=[...new Set(cafs().map(o=>o.name).filter(Boolean))].map(n=>`<option value="${esc(n)}">`).join("");
  $("#svCName").value=x.name||"";$("#svCSerie").value=x.serie||"F";$("#svCAmt").value=c?numStr(SE.cafPrincipal0(c)):"";$("#svCDate").value=x.date||todayISO();$("#svCDate").max=todayISO();
  $("#svCRate0").value=x.rate0!=null?numStr(x.rate0):"";$("#svCRateM").value=x.rateM!=null?numStr(x.rateM):"";$("#svCTerm").value=x.termY||"";
  $("#svCIrs").value=x.irs!=null?numStr(x.irs):"";$("#svCIrs").placeholder=numStr(cfg.tax.rate);$("#svCInst").value=x.inst||"";svAcctOpts("#svCAcct",x.acct);
  $("#svCOv").value=c&&+c.override>0?numStr(c.override):"";$("#svCNote").value=x.note||"";$("#svCErr").hidden=true;
  $("#svCAmt").disabled=!!(c&&(c.sales||[]).length);$("#svCAmt").title=$("#svCAmt").disabled?"Já tem resgates: o capital inicial não pode mudar":"";
  svCafSerie();$("#svCafDlg").showModal();(c?$("#svCName"):$("#svCAmt")).focus()}
$("#svCSerie").addEventListener("change",svCafSerie);$("#svCDate").addEventListener("change",svCafSerie);
$("#svCafForm").addEventListener("submit",e=>{e.preventDefault();const err=(m,f)=>{$("#svCErr").textContent=m;$("#svCErr").hidden=false;if(f)$(f).focus()};
  const s=$("#svCSerie").value,R=SE.RULES.caf[s],a=parseNum($("#svCAmt").value),d=$("#svCDate").value,opt=id=>{const v=$(id).value.trim();return v?parseNum(v):null};
  const r0=opt("#svCRate0"),rM=opt("#svCRateM"),irs=opt("#svCIrs"),ov=opt("#svCOv"),tY=$("#svCTerm").value?+$("#svCTerm").value:null;
  if(!d||d>todayISO())return err("Indica a data da subscrição (hoje ou antes).","#svCDate");
  const old=S.svEdit&&S.items.get(S.svEdit);
  if(!(a>0))return err("Indica o capital subscrito.","#svCAmt");if(s==="F"&&a<10&&!old)return err("Na Série F o mínimo por subscrição é 10 € (10 unidades).","#svCAmt");
  if(r0!=null&&!(r0>=0&&r0<20))return err("A taxa inicial não é válida.","#svCRate0");if(rM!=null&&!(rM>=0&&rM<20))return err("A taxa não é válida.","#svCRateM");
  if(R.manual&&rM==null&&!(old&&old.rates&&Object.keys(old.rates).length))return err(`Indica a taxa bruta atual da ${R.name}.`,"#svCRateM");
  if(irs!=null&&!(irs>=0&&irs<=100))return err("A taxa de IRS fica entre 0 e 100%.","#svCIrs");if(ov!=null&&!(ov>0))return err("O valor atual não é válido.","#svCOv");
  const o=Object.assign({},old||{},{id:old?old.id:newId("c"),kind:"caf",serie:s,date:d,name:$("#svCName").value.trim()||undefined,inst:$("#svCInst").value.trim()||undefined,note:$("#svCNote").value.trim()||undefined,acct:$("#svCAcct").value||undefined});
  if(!old||!(old.sales||[]).length){o.amount=svR2(a);o.amount0=svR2(a);o.soldCost=old?old.soldCost:undefined}
  ["rate0","rateM","irs"].forEach((k,i)=>{const v=[r0,rM,irs][i];if(v==null)delete o[k];else o[k]=v});if(tY)o.termY=tY;else delete o.termY;
  if(!old||old.acct!==o.acct||old.date!==d){if(o.acct&&d===todayISO())o.payAt=Date.now();else delete o.payAt}
  if(ov!=null){if(!old||+old.override!==ov){o.override=svR2(ov);o.ovDate=todayISO()}}else{delete o.override;delete o.ovDate}
  Object.keys(o).forEach(k=>o[k]===undefined&&delete o[k]);
  Store.put(o);$("#svCafDlg").close();toast(old?"Subscrição guardada":"Subscrição adicionada")});
$("#svCDel").onclick=()=>{const c=S.items.get(S.svEdit),b=$("#svCDel");if(!c)return;if(!b.dataset.sure){b.dataset.sure="1";b.textContent="Toca de novo para apagar";setTimeout(()=>{delete b.dataset.sure;b.textContent="Apagar"},4000);return}
  delete b.dataset.sure;b.textContent="Apagar";Store.del(c.id);$("#svCafDlg").close();toast("Subscrição apagada")};
/* Investimentos → Aforro usa os mesmos diálogos */
openCaf=c=>svOpenCaf(c);openCafSell=c=>svOpenRed(c);

/* ---------- diálogo: outro produto ---------- */
function svProdType(t){S.svPT=t;document.querySelectorAll("#svPTypes [data-svt]").forEach(b=>{const on=b.dataset.svt===t;b.setAttribute("aria-checked",String(on));b.tabIndex=on?0:-1});
  const ct=t==="ct";$("#svPSchedL").hidden=!ct;$("#svPRate").closest("label").hidden=ct;
  $("#svPTermL").firstChild.textContent=t==="dp"?"Prazo (meses)":"Prazo (meses, opcional)";
  $("#svPHelp").textContent=t==="conta"?"Conta poupança: podes depositar e levantar quando quiseres. Se já tens esta conta em Contas, não a registes aqui também (contava duas vezes no património).":t==="dp"?"Depósito a prazo: juros no fim do prazo (ou na periodicidade do contrato). Levantar antes do fim costuma fazer perder os juros do período.":t==="ct"?"Certificados do Tesouro: escreve a taxa bruta de cada ano tal como está na ficha técnica da tua série. Juros pagos uma vez por ano.":"Define as regras do teu produto como estão no contrato."}
function svOpenProd(p,type){S.svEdit=p?p.id:null;const x=p||{type:type||"conta",date:todayISO()},T=SE.RULES.sav[x.type]||SE.RULES.sav.outro;
  $("#svPTitle").textContent=p?"Editar produto":"Novo produto de poupança";$("#svPSubmit").textContent=p?"Guardar":"Adicionar";$("#svPDel").hidden=!p;
  svProdType(x.type);$("#svPName").value=x.name||"";$("#svPInst").value=x.inst||"";$("#svPAmt").value=p?numStr(p.amount):"";$("#svPDate").value=x.date;$("#svPDate").max=todayISO();
  $("#svPRate").value=x.rate!=null?numStr(x.rate):"";$("#svPTerm").value=x.termM||"";$("#svPSched").value=(x.sched||[]).map(numStr).join("; ");
  $("#svPPer").value=String(x.periodM!=null?x.periodM:T.periodM);$("#svPCap").value=(x.cap!=null?x.cap:T.cap)?"1":"0";$("#svPBasis").value=String(x.basis||T.basis);$("#svPEarly").value=x.early||T.early;
  $("#svPIrs").value=x.irs!=null?numStr(x.irs):"";$("#svPIrs").placeholder=numStr(svCfg().tax.rate);svAcctOpts("#svPAcct",x.acct);$("#svPNote").value=x.note||"";$("#svPErr").hidden=true;
  $("#svPAmt").disabled=!!(p&&(p.moves||[]).length);$("#svProdDlg").showModal();$("#svPName").focus()}
$("#svPTypes").addEventListener("click",e=>{const b=e.target.closest("[data-svt]");if(!b)return;const t=b.dataset.svt,T=SE.RULES.sav[t];svProdType(t);
  if(!S.svEdit){$("#svPPer").value=String(T.periodM);$("#svPCap").value=T.cap?"1":"0";$("#svPBasis").value=String(T.basis);$("#svPEarly").value=T.early;if(t==="dp"&&!$("#svPTerm").value)$("#svPTerm").value=T.termM}});
$("#svPTypes").addEventListener("keydown",e=>{const B=[...$("#svPTypes").querySelectorAll("[data-svt]")],i=B.findIndex(b=>b.dataset.svt===S.svPT);let n=null;if(e.key==="ArrowRight"||e.key==="ArrowDown")n=(i+1)%B.length;else if(e.key==="ArrowLeft"||e.key==="ArrowUp")n=(i-1+B.length)%B.length;if(n!=null){e.preventDefault();B[n].click();B[n].focus()}});
$("#svProdForm").addEventListener("submit",e=>{e.preventDefault();const err=(m,f)=>{$("#svPErr").textContent=m;$("#svPErr").hidden=false;if(f)$(f).focus()};
  const t=S.svPT,a=parseNum($("#svPAmt").value),d=$("#svPDate").value,old=S.svEdit&&S.items.get(S.svEdit),term=$("#svPTerm").value?+$("#svPTerm").value:null,per=+$("#svPPer").value,irsR=$("#svPIrs").value.trim(),irs=irsR?parseNum(irsR):null;
  if(!(a>0))return err("Indica o montante inicial.","#svPAmt");if(!d||d>todayISO())return err("Indica a data de início (hoje ou antes).","#svPDate");
  let rate=null,sched=null;if(t==="ct"){sched=$("#svPSched").value.split(/;/).map(x=>x.trim()).filter(Boolean).map(parseNum);if(!sched.length||sched.some(x=>!(x>=0&&x<30)))return err("Escreve a taxa de cada ano, separadas por ponto e vírgula.","#svPSched")}
  else{rate=parseNum($("#svPRate").value);if(!(rate>=0&&rate<30))return err("Indica a TANB em %.","#svPRate")}
  if(t==="dp"&&!(term>0))return err("Indica o prazo do depósito em meses.","#svPTerm");if(per===0&&!(term>0))return err("Para juros no fim do prazo, indica o prazo.","#svPTerm");
  if(term!=null&&!(term>=1&&term<=600))return err("O prazo vai de 1 a 600 meses.","#svPTerm");if(irs!=null&&!(irs>=0&&irs<=100))return err("A taxa de IRS fica entre 0 e 100%.","#svPIrs");
  const o=Object.assign({},old||{},{id:old?old.id:newId("sv"),kind:"sav",type:t,name:$("#svPName").value.trim()||undefined,inst:$("#svPInst").value.trim()||undefined,date:d,amount:svR2(a),
    rate:rate==null?undefined:rate,sched:sched||undefined,termM:term||undefined,periodM:per,cap:$("#svPCap").value==="1",basis:$("#svPBasis").value==="per"?"per":+$("#svPBasis").value,early:$("#svPEarly").value,
    irs:irs==null?undefined:irs,acct:$("#svPAcct").value||undefined,note:$("#svPNote").value.trim()||undefined});
  if(old&&old.moves&&old.moves.length)o.amount=old.amount;
  if(!old||old.acct!==o.acct||old.date!==d){if(o.acct&&d===todayISO())o.payAt=Date.now();else delete o.payAt}
  Object.keys(o).forEach(k=>o[k]===undefined&&delete o[k]);
  Store.put(o);$("#svProdDlg").close();toast(old?"Produto guardado":"Produto adicionado")});
$("#svPDel").onclick=()=>{const c=S.items.get(S.svEdit),b=$("#svPDel");if(!c)return;if(!b.dataset.sure){b.dataset.sure="1";b.textContent="Toca de novo para apagar";setTimeout(()=>{delete b.dataset.sure;b.textContent="Apagar"},4000);return}
  delete b.dataset.sure;b.textContent="Apagar";Store.del(c.id);$("#svProdDlg").close();toast("Produto apagado")};

/* ---------- diálogo: resgates, depósitos e levantamentos ---------- */
function svOpenRed(o){const x=svRunOf(o),r=x.r,caf=o.kind==="caf";S.svRed=o.id;
  if(!r.canRedeem){toast(caf?`Só podes resgatar depois do primeiro vencimento de juros (${dmy(r.redeemFrom)}).`:`Só podes resgatar depois do primeiro vencimento (${dmy(r.redeemFrom)}).`);return}
  const liquid=!caf&&(r.liquid||o.type==="outro");S.svRK="part";
  $("#svRTitle").textContent=caf?"Resgatar certificados":liquid?"Depositar ou levantar":"Resgatar";
  $("#svRKind").querySelector('[data-svk="dep"]').hidden=!liquid;$("#svRKind").querySelector('[data-svk="part"]').textContent=liquid?"Levantar":"Resgate parcial";
  $("#svRInfo").textContent=`${svName(o)} · valor hoje ${eur(r.value)}${caf?` (capital ${eur(r.principal)} + juros ${eur(r.value-r.principal)})`:""}.`;
  $("#svRDate").value=todayISO();$("#svRDate").max=todayISO();$("#svRDate").min=caf?r.redeemFrom:o.date;$("#svRAmt").value="";svAcctOpts("#svRAcct",o.acct);$("#svRErr").hidden=true;svRKind();$("#svRedDlg").showModal();$("#svRAmt").focus()}
function svRKind(){document.querySelectorAll("#svRKind button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.svk===S.svRK)));
  const tot=S.svRK==="total",dep=S.svRK==="dep";$("#svRAmt").disabled=tot;$("#svRAcctL").firstChild.textContent=dep?"Sai da conta":"Transferir para a conta";
  $("#svRSubmit").textContent=dep?"Registar depósito":tot?"Registar resgate total":"Registar";svRPrev()}
/* valor à data do resgate: capital + juros já vencidos nessa data (os do trimestre em curso não contam) */
function svRedAt(o,d){const r=svRunOf(o).r;return{v:SE.valueAt(r.points,d),p:SE.principalAt(r.points,d),r}}
function svRPrev(){const o=S.items.get(S.svRed);if(!o)return;const d=$("#svRDate").value||todayISO(),k=svRedAt(o,d),caf=o.kind==="caf";
  if(S.svRK==="total")$("#svRAmt").value=numStr(svR2(k.v));
  const x=parseNum($("#svRAmt").value),p=$("#svRPrev");if(!(x>0)){p.innerHTML="";return}
  if(S.svRK==="dep"){p.innerHTML=`Depositas <b class="num">${eur(x)}</b>. A partir de ${dmy(d)} passa a render juros.`;return}
  if(x>k.v+.005){p.innerHTML=`<span style="color:var(--out)">Nessa data o valor era ${eur(k.v)}.</span>`;return}
  const f=Math.min(1,x/k.v),cap=svR2(k.p*f),jur=svR2(x-cap);
  let lost="";if(caf){const nx=k.r.events.find(e=>e.date>d);if(nx&&nx.start<d){const dd=SE.days(nx.start,d),tt=SE.days(nx.start,nx.date);lost=` Perdes os juros do trimestre em curso (cerca de ${eur(nx.net*f*dd/tt)} líquidos, ${dd} de ${tt} dias).`}}
  else if(o.early==="lose"||(!o.early&&SE.RULES.sav[o.type]&&SE.RULES.sav[o.type].early==="lose"))lost=" Pelas regras deste produto, perdes os juros corridos do período sobre o valor levantado.";
  p.innerHTML=`Recebes <b class="num">${eur(x)}</b>: <b class="num">${eur(cap)}</b> de capital e <b class="num" style="color:var(--in)">${eur(jur)}</b> de juros já líquidos.${lost}`}
$("#svRKind").addEventListener("click",e=>{const b=e.target.closest("[data-svk]");if(b){S.svRK=b.dataset.svk;svRKind()}});
$("#svRAmt").addEventListener("input",svRPrev);$("#svRDate").addEventListener("change",svRPrev);
$("#svRedForm").addEventListener("submit",e=>{e.preventDefault();const o=S.items.get(S.svRed);if(!o)return;const err=m=>{$("#svRErr").textContent=m;$("#svRErr").hidden=false};
  const d=$("#svRDate").value||todayISO(),x=parseNum($("#svRAmt").value),acct=$("#svRAcct").value||undefined,caf=o.kind==="caf",at=d===todayISO()?Date.now():undefined;
  if(d>todayISO())return err("A data não pode ser no futuro.");if(!(x>0))return err("Indica o valor.");
  const k=svRedAt(o,d);
  if(S.svRK==="dep"){const n=Object.assign({},o,{moves:[...(o.moves||[]),{d,a:svR2(x),acct,at}]});Object.keys(n.moves[n.moves.length-1]).forEach(z=>n.moves[n.moves.length-1][z]===undefined&&delete n.moves[n.moves.length-1][z]);Store.put(n);$("#svRedDlg").close();toast("Depósito registado");return}
  if(caf&&d<k.r.redeemFrom)return err(`Só podes resgatar a partir de ${dmy(k.r.redeemFrom)} (primeiro vencimento).`);
  if(x>k.v+.005)return err(`Nessa data o valor disponível era ${eur(k.v)}.`);
  const f=Math.min(1,x/k.v),tot=f>=.9999,cap=svR2(tot?k.p:k.p*f),jur=svR2(x-cap);
  if(caf){const s={d,v:svR2(x),c:cap,g:jur};if(acct)s.acct=acct;if(at)s.at=at;
    const n=Object.assign({},o,{amount0:SE.cafPrincipal0(o),amount:tot?0:svR2((+o.amount||0)-cap),realized:svR2((+o.realized||0)+jur),soldCost:svR2((+o.soldCost||0)+cap),sales:[...(o.sales||[]),s]});
    if(+o.override>0){if(tot){delete n.override;delete n.ovDate}}
    Store.put(n)}
  else{const m={d,a:-svR2(tot?k.v:x),acct,at};Object.keys(m).forEach(z=>m[z]===undefined&&delete m[z]);Store.put(Object.assign({},o,{moves:[...(o.moves||[]),m]}))}
  $("#svRedDlg").close();toast(tot?"Resgate total registado":"Resgate registado")});

/* ---------- detalhe: calendário completo de capitalização de uma subscrição/produto ---------- */
function svOpenDet(id){S.svDet=id;if(!$("#svDetDlg").open)$("#svDetDlg").showModal();svDet()}
function svDet(){const o=S.items.get(S.svDet);if(!o){if($("#svDetDlg").open)$("#svDetDlg").close();return}const {r}=svRunOf(o),caf=o.kind==="caf",t=todayISO(),fut=$("#svDFut").checked;
  $("#svDTitle").textContent=svName(o);
  $("#svDSub").innerHTML=caf?`Subscrição de ${dmy(o.date)} · ${eur(r.P0)} · antiguidade ${svAge(o.date)}${o.inst?" · "+esc(o.inst):""}${r.rule.termY?` · termina a ${dmy(SE.addMonths(o.date,r.rule.termY*12,"next1"))}`:""}`:`${SV_T[o.type||"outro"].n} · desde ${dmy(o.date)}${o.inst?" · "+esc(o.inst):""}`;
  $("#svDTiles").innerHTML=[["Valor atual",eur(r.value)],["Capital",eur(r.principal)],["Juros brutos",eur(r.grossToDate)],["IRS retido",`− ${eur(r.taxToDate)}`],["Juros líquidos",`+ ${eur(r.netToDate)}`]].concat(Math.abs(r.adjToDate)>=.01?[["Acerto AforroNet",seur(r.adjToDate)]]:[]).concat(r.received?[["Já recebido",eur(r.received)]]:[]).map(x=>`<div class="sv-tile"><span>${x[0]}</span><b class="num">${x[1]}</b></div>`).join("");
  $("#svDActs").innerHTML=(r.closed?"":`<button class="btn" type="button" data-svred="${esc(o.id)}">${caf?"Resgatar":"Movimento"}</button>`)+`<button class="btn ghost" type="button" data-svedit="${esc(o.id)}">Editar</button>`+(caf?`<button class="btn ghost" type="button" data-svnew="caf" data-svname="${esc(o.name||"")}">+ Nova subscrição neste investimento</button>`:"");
  const pts=[];r.points.forEach(p=>{if(p.t==="mat")return;pts.push({d:p.d,[p.d<=t?"cap":"proj"]:p.cap,inv:p.prin})});const ti=pts.findIndex(p=>p.d>t);if(ti>0)pts.splice(ti,0,{d:t,cap:r.value,proj:r.value,inv:r.principal});
  svChart("#svDChart",{pts:fut?pts:pts.filter(p=>p.d<=t),split:fut?t:null,h:180,label:"Evolução desta subscrição",series:[{k:"inv",lbl:"Capital",c:"var(--ink-2)",dash:"4 4",w:1.5},{k:"cap",lbl:"Valor",c:"var(--in)",area:true},{k:"proj",lbl:"Previsão",c:"var(--in)",dash:"6 5"}]});
  const E=r.events.filter(e=>fut||e.past);
  $("#svDTable").innerHTML=E.length?`<table class="sv-table sv-det"><thead><tr><th scope="col">#</th><th scope="col">Vencimento</th>${caf?`<th scope="col">Ano</th>`:""}<th scope="col" class="r">Taxa</th><th scope="col" class="r">Capital</th><th scope="col" class="r">Bruto</th><th scope="col" class="r">IRS</th><th scope="col" class="r">Líquido</th><th scope="col" class="r">Depois</th></tr></thead><tbody>${E.map(e=>`<tr class="${e.past?"":"fut"}"><td data-l="#">${e.k}</td><td data-l="Vencimento" class="num">${dmy(e.date)}</td>${caf?`<td data-l="Ano">${e.y}</td>`:""}<td data-l="Taxa" class="r"><span class="num">${svPct(e.rate.gross)}</span>${caf&&e.rate.base!=null?`<small>${svPct(e.rate.base)} + ${svPct(e.rate.prem,2)}</small>`:""} ${svChip(e.rate.kind)}${caf?`<button class="link sv-qe" type="button" data-svq="${esc(o.id)}" data-k="${e.k}" aria-label="Corrigir a taxa do vencimento ${e.k}">corrigir</button>`:""}</td><td data-l="Capital" class="r num">${eur(e.cap)}</td><td data-l="Bruto" class="r num">${eur(e.gross)}</td><td data-l="IRS" class="r num">− ${eur(e.tax)}</td><td data-l="Líquido" class="r num">+ ${eur(e.net)}</td><td data-l="Depois" class="r num"><b>${eur(e.after)}</b></td></tr>`).join("")}</tbody></table>`:`<p class="muted">Ainda sem vencimentos.</p>`}
$("#svDFut").addEventListener("change",svDet);
function svOpenQ(id,k){const o=S.items.get(id);if(!o)return;const e=svRunOf(o).r.events.find(x=>x.k===k);if(!e)return;S.svQ={id,k};
  $("#svQInfo").textContent=`Vencimento ${k} (${dmy(e.date)}) · trimestre que começou a ${dmy(e.start)} · agora: ${svPct(e.rate.gross)} (${SE.KIND[e.rate.kind]}).`;
  $("#svQRate").value=o.rates&&o.rates[k]!=null?numStr(o.rates[k]):"";$("#svQDel").hidden=!(o.rates&&o.rates[k]!=null)&&!(k===1&&o.rate0!=null);$("#svQDlg").showModal();$("#svQRate").focus()}
$("#svQForm").addEventListener("submit",e=>{e.preventDefault();const q=S.svQ,o=q&&S.items.get(q.id);if(!o)return;const v=parseNum($("#svQRate").value);if(!(v>=0&&v<20)){toast("Indica a taxa em %, por exemplo 2,25");return}
  Store.put(Object.assign({},o,{rates:Object.assign({},o.rates||{},{[q.k]:v})}));$("#svQDlg").close();svDet();toast("Taxa do trimestre guardada")});
$("#svQDel").onclick=()=>{const q=S.svQ,o=q&&S.items.get(q.id);if(!o)return;const n=Object.assign({},o,{rates:Object.assign({},o.rates||{})});delete n.rates[q.k];if(q.k===1)delete n.rate0;Store.put(n);$("#svQDlg").close();svDet();toast("Volta a usar a tabela")};
/* a taxa base escrita em Investimentos → Aforro também fica na tabela, para o mês atual */
$("#cafBase").addEventListener("change",()=>{const v=parseNum($("#cafBase").value);if(v>=0&&v<=2.5)setTimeout(()=>svPutCfg(d=>{d.rates=d.rates||{};d.rates.F=d.rates.F||{};d.rates.F[todayISO().slice(0,7)]={v:SE.r3(v),o:"user",src:"escrita em Investimentos → Aforro",at:todayISO()}}),0)});
/* manter os diálogos abertos atualizados quando os dados mudam */
(f=>{render=function(){f();try{renderSav();if($("#svDetDlg").open)svDet()}catch(e){console.error(e)}}})(render);
