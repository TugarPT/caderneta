/* Testes do motor de Poupanças. Correr: node --test dev/savings/*.test.js
   Cada valor esperado está calculado à mão nos comentários, para poder ser verificado sem a app. */
const test=require("node:test"),assert=require("node:assert/strict"),SE=require("./savings_engine.js");
const flat=v=>SE.constBook(v);

test("datas de vencimento: dia inexistente passa para o dia 1 do mês seguinte (regra IGCP)",()=>{
  assert.equal(SE.addMonths("2024-01-31",3),"2024-05-01");     // 31 de abril não existe
  assert.equal(SE.addMonths("2024-01-31",6),"2024-07-31");
  assert.equal(SE.addMonths("2023-11-30",3),"2024-03-01");     // 30 de fevereiro não existe
  assert.equal(SE.addMonths("2024-11-15",3),"2025-02-15");
  assert.equal(SE.addMonths("2024-01-31",1,"clamp"),"2024-02-29"); // bancos: último dia do mês
  const r=SE.runCaf({serie:"F",date:"2024-01-31",amount:1000},{today:"2024-12-31",book:flat(2)});
  assert.deepEqual(r.events.slice(0,4).map(e=>e.date),["2024-05-01","2024-07-31","2024-10-31","2025-01-31"]);
});

test("prémios de permanência da Série F por ano (0 / 0,25 / 0,50 / 1 / 1,50 / 1,75)",()=>{
  const F=SE.RULES.caf.F,exp=[0,.25,.25,.25,.25,.5,.5,.5,.5,1,1,1.5,1.5,1.75,1.75];
  exp.forEach((pp,i)=>assert.equal(SE.premium(F,i+1),pp,"ano "+(i+1)));
  assert.equal(SE.premium(F,16),0);
});

test("prémios de permanência da Série E (0 / 0,5 / 1)",()=>{
  const E=SE.RULES.caf.E;
  assert.deepEqual([1,2,5,6,10].map(y=>SE.premium(E,y)),[0,.5,.5,1,1]);
});

test("taxa base: média de 10 dias da Euribor 3M, 3 casas decimais, limites da série",()=>{
  assert.equal(SE.euriborAvg([2.031,2.029,2.035,2.04,2.038,2.036,2.03,2.027,2.025,2.03]),2.032); // soma 20,321 / 10
  assert.equal(SE.baseFromEuribor("F",2.032),2.032);
  assert.equal(SE.baseFromEuribor("F",3.1),2.5);      // teto 2,50%
  assert.equal(SE.baseFromEuribor("F",-0.2),0);       // piso 0%
  assert.equal(SE.baseFromEuribor("E",1.9876),2.988); // E3 arredondada (1,988) + 1
  assert.equal(SE.baseFromEuribor("E",3),3.5);        // teto 3,5%
});

test("Série F: juros compostos trimestrais, IRS retido e líquido somado ao capital",()=>{
  /* 1000 € a 2,5% (ano 1, sem prémio), IRS 28%:
     T1: 1000,00 × 2,5%/4 = 6,25 bruto; IRS 1,75; líquido 4,50 → 1004,50
     T2: 1004,50 × 0,625% = 6,278 → 6,28; IRS 1,7584 → 1,76; líquido 4,52 → 1009,02
     T3: 1009,02 × 0,625% = 6,306 → 6,31; IRS 1,7668 → 1,77; líquido 4,54 → 1013,56
     T4: 1013,56 × 0,625% = 6,335 → 6,33; IRS 1,7724 → 1,77; líquido 4,56 → 1018,12 */
  const r=SE.runCaf({serie:"F",date:"2024-01-15",amount:1000},{today:"2025-01-15",book:flat(2.5),irs:28});
  const E=r.events.slice(0,4);
  assert.deepEqual(E.map(e=>e.gross),[6.25,6.28,6.31,6.33]);
  assert.deepEqual(E.map(e=>e.tax),[1.75,1.76,1.77,1.77]);
  assert.deepEqual(E.map(e=>e.net),[4.5,4.52,4.54,4.56]);
  assert.deepEqual(E.map(e=>e.after),[1004.5,1009.02,1013.56,1018.12]);
  assert.equal(r.value,1018.12);
  assert.ok(r.value>1000+4*4.5,"não é juro simples sobre o capital inicial");
  assert.equal(r.grossToDate,25.17);assert.equal(r.taxToDate,7.05);assert.equal(r.netToDate,18.12);
  E.forEach(e=>assert.equal(SE.r2(e.gross-e.tax),e.net));
});

test("Série F: o 5.º trimestre já tem o prémio do ano 2 (base + 0,25)",()=>{
  const r=SE.runCaf({serie:"F",date:"2024-01-15",amount:1000},{today:"2025-06-01",book:flat(2)});
  assert.equal(r.events[3].rate.gross,2);assert.equal(r.events[4].rate.gross,2.25);assert.equal(r.events[4].rate.prem,.25);
  assert.equal(r.events[4].y,2);
});

test("Série F: a taxa base de cada trimestre é a do mês em que o trimestre começa",()=>{
  const cfg={rates:{F:{"2024-01":{v:2,o:"igcp"},"2024-04":{v:2.5,o:"igcp"}}},proj:{F:1.5}};
  const book=SE.rateBook(cfg,"2024-09-01"),r=SE.runCaf({serie:"F",date:"2024-01-15",amount:1000},{today:"2024-09-01",book});
  assert.deepEqual(r.events.slice(0,4).map(e=>[e.rate.gross,e.rate.kind]),[[2,"oficial"],[2.5,"oficial"],[2.5,"estimada"],[1.5,"hipotetica"]]);
  // não se assume que a taxa atual dura 15 anos: trimestres que começam depois deste mês usam o cenário, marcado como hipotético
  assert.ok(r.events.filter(e=>e.start.slice(0,7)>"2024-09").every(e=>e.rate.kind==="hipotetica"&&e.rate.gross>=1.5));
});

test("Série F: 15 anos = 60 vencimentos; no fim o capital é reembolsado",()=>{
  const r=SE.runCaf({serie:"F",date:"2010-03-10",amount:1000},{today:"2026-01-01",book:flat(0)});
  assert.equal(r.events.length,60);assert.equal(r.events[59].date,"2025-03-10");
  assert.equal(r.matured.v,r.events[59].after);assert.equal(r.value,0);assert.equal(SE.wealthAt(r,"2026-01-01"),r.matured.v);
  assert.equal(r.received,r.matured.v);
  // taxa base 0: só os prémios rendem a partir do 2.º ano
  assert.equal(r.events[3].gross,0);assert.equal(r.events[4].gross,.63); // 1000 × 0,25%/4 = 0,625 → 0,63
});

test("Série E: prazo de 10 anos (40 vencimentos)",()=>{
  const r=SE.runCaf({serie:"E",date:"2018-01-10",amount:1000},{today:"2026-01-01",book:flat(1)});
  assert.equal(r.events.length,40);assert.equal(r.events[4].rate.gross,1.5);
});

test("IRS: taxa da subscrição sobrepõe-se à geral; 0% → líquido = bruto",()=>{
  const r=SE.runCaf({serie:"F",date:"2024-01-15",amount:1000,irs:0},{today:"2024-05-01",book:flat(2.5),irs:28});
  assert.equal(r.events[0].tax,0);assert.equal(r.events[0].net,6.25);
});

test("Taxa indicada pelo utilizador para um trimestre substitui a tabela",()=>{
  const r=SE.runCaf({serie:"F",date:"2024-01-15",amount:1000,rate0:3,rates:{2:2.2}},{today:"2024-08-01",book:flat(2.5)});
  assert.equal(r.events[0].rate.gross,3);assert.equal(r.events[0].rate.kind,"utilizador");
  assert.equal(r.events[1].rate.gross,2.2);assert.equal(r.events[2].rate.gross,2.5);
});

test("Resgate: só depois do primeiro vencimento; resgate parcial reduz o capital na proporção",()=>{
  const a=SE.runCaf({serie:"F",date:"2024-01-15",amount:1000},{today:"2024-04-01",book:flat(2.5)});
  assert.equal(a.canRedeem,false);assert.equal(a.redeemFrom,"2024-04-15");
  /* resgate de metade a 2024-05-01 (valor 1004,50 → recebe 502,25; ficam 502,25)
     T2: 502,25 × 0,625% = 3,139 → 3,14; IRS 0,88; líquido 2,26 → 504,51 */
  const r=SE.runCaf({serie:"F",date:"2024-01-15",amount:500,soldCost:500,sales:[{d:"2024-05-01",c:500,v:502.25}]},{today:"2024-08-01",book:flat(2.5)});
  assert.equal(r.P0,1000);assert.equal(r.canRedeem,true);
  assert.equal(r.events[1].cap,502.25);assert.equal(r.events[1].gross,3.14);assert.equal(r.value,504.51);
  assert.equal(r.received,502.25);assert.equal(r.principal,500);
});

test("Valor do AforroNet (acerto) a uma data: parte desse valor e regista o acerto à parte",()=>{
  const r=SE.runCaf({serie:"F",date:"2024-01-15",amount:1000,override:1100,ovDate:"2024-08-01"},{today:"2024-12-01",book:flat(2.5)});
  // 15/10: 1100 × 0,625% = 6,875 → 6,88; IRS 1,93; líquido 4,95
  assert.equal(r.value,1104.95);assert.equal(r.adjToDate,90.98); // 1100 − 1009,02
});

test("Conta poupança: juros diários Act/365, capitalização anual",()=>{
  /* 10 000 € a 2%: 2023 (365 dias) = 200,00 bruto, IRS 56,00, líquido 144,00 → 10 144,00
     2024 (366 dias): 10 144 × 2% × 366/365 = 203,436 → 203,44; IRS 56,96; líquido 146,48 → 10 290,48 */
  const r=SE.runBank({type:"conta",date:"2023-01-01",amount:10000,rate:2,periodM:12,basis:365},{today:"2025-01-02"});
  assert.deepEqual(r.events.slice(0,2).map(e=>[e.gross,e.tax,e.net,e.after]),[[200,56,144,10144],[203.44,56.96,146.48,10290.48]]);
  assert.equal(r.value,10290.48);
});

test("Conta poupança: mudança de taxa a meio do período e depósito a meio",()=>{
  /* 1000 € a 2% de 01/01 a 01/07 (181 dias) e 4% de 01/07 a 01/01 (184 dias), mais 1000 € a 01/07:
     1000×2%×181/365 = 9,9178 ; 2000×4%×184/365 = 40,3288 ; total 50,2466 → 50,25 */
  const r=SE.runBank({type:"conta",date:"2025-01-01",amount:1000,rate:2,rates:[{d:"2025-07-01",r:4}],moves:[{d:"2025-07-01",a:1000}],periodM:12,basis:365},{today:"2026-01-02"});
  assert.equal(r.events[0].gross,50.25);assert.equal(r.events[0].cap,2000);
});

test("Depósito a prazo: juros no fim, pagos à conta, capital devolvido",()=>{
  // 5000 € a 3% durante 12 meses (365 dias): 150,00 bruto; IRS 42,00; líquido 108,00
  const r=SE.runBank({type:"dp",date:"2025-03-01",amount:5000,rate:3,termM:12,periodM:0},{today:"2026-04-01"});
  assert.equal(r.events.length,1);assert.equal(r.events[0].net,108);assert.equal(r.events[0].paid,true);
  assert.equal(r.matured.v,5000);assert.equal(r.received,5108);assert.equal(r.value,0);
});

test("Depósito a prazo: mobilização antecipada perde os juros corridos da parte levantada",()=>{
  // levanta metade a meio: perde metade dos juros acumulados até aí
  const r=SE.runBank({type:"dp",date:"2025-01-01",amount:1000,rate:3.65,termM:12,periodM:0,moves:[{d:"2025-07-01",a:-500}]},{today:"2026-02-01"});
  // até 01/07: 1000×3,65%×181/365 = 18,10 → perde 9,05; depois 500×3,65%×184/365 = 9,20 → bruto 18,25
  assert.equal(r.lost,9.05);assert.equal(r.events[0].gross,18.25);
});

test("Certificados do Tesouro: taxas por ano indicadas pelo utilizador, juros pagos anualmente",()=>{
  const r=SE.runBank({type:"ct",date:"2024-02-01",amount:1000,sched:[1,1.5],termM:24},{today:"2026-03-01"});
  assert.deepEqual(r.events.map(e=>e.gross),[10,15]);assert.deepEqual(r.events.map(e=>e.net),[7.2,10.8]);
  assert.equal(r.received,1018);
});

test("TIR (rentabilidade anual): -1000 e +1100 um ano (366 dias) depois",()=>{
  const r=SE.xirr([{d:"2024-01-01",a:-1000},{d:"2025-01-01",a:1100}]);
  assert.ok(Math.abs(r-(Math.pow(1.1,365/366)-1))<1e-6);
});

test("Englobamento: estimativa da diferença face à retenção",()=>{
  assert.deepEqual(SE.englobamento(100,28,13),{final:13,diff:15});
  assert.equal(SE.englobamento(100,28,null),null);
});

test("Simulador (taxa fixa): capitalização anual vs mensal",()=>{
  const a=SE.simulate({mode:"rate",P0:1000,monthly:0,rate:12,irs:0,years:1,compM:12,start:"2026-01-01"});
  assert.equal(a.final,1120);assert.equal(a.gross,120);
  const b=SE.simulate({mode:"rate",P0:1000,monthly:0,rate:12,irs:0,years:1,compM:1,start:"2026-01-01"});
  assert.equal(b.final,1126.84); // 1000 × 1,01^12 = 1126,825; com o saldo arredondado ao cêntimo todos os meses dá 1126,84
});

test("Simulador: exemplo do pedido (5000 € + 200 €/mês, 2,5%, IRS 28%, 10 anos)",()=>{
  const s=SE.simulate({mode:"rate",P0:5000,monthly:200,rate:2.5,irs:28,years:10,compM:3,start:"2026-01-01"});
  assert.equal(s.invested,28800);assert.equal(s.reforcos,119);
  assert.equal(SE.r2(s.gross-s.tax),s.net);assert.equal(SE.r2(s.invested+s.net),s.final);
});

test("Simulador Série F: cada reforço é uma subscrição própria e a base fica limitada a 2,50%",()=>{
  const one=SE.simulate({mode:"cafF",P0:1000,monthly:0,rate:4,irs:28,years:1,start:"2024-01-15"});
  assert.equal(one.base,2.5);assert.equal(one.final,1018.12);assert.equal(one.gross,25.17);assert.equal(one.tax,7.05);
  const m=SE.simulate({mode:"cafF",P0:1000,monthly:100,rate:2,irs:28,years:2,start:"2024-01-15"});
  assert.equal(m.subs,24);assert.equal(m.invested,3300);assert.equal(SE.r2(m.invested+m.net),m.final);
});

test("Integração IGCP: ler a taxa do texto da página",()=>{
  const t="A taxa de juro bruta para novas subscrições de Certificados de Aforro, Série F, em setembro de 2026 foi fixada em 2,500%.";
  assert.deepEqual(SE.parseIgcp(t),[{serie:"F",ym:"2026-09",v:2.5}]);
});

test("Antiguidade em anos e meses",()=>{
  assert.deepEqual(SE.ageYM("2023-06-15","2026-11-01"),{y:3,m:4,months:40});
});

test("Série E derivada da Série F do mesmo mês (mesma Euribor): F<2,5 → F+1; F=2,5 → 3,5; F=0 → não se sabe",()=>{
  const b=SE.rateBook({rates:{F:{"2026-01":{v:1.987,o:"igcp"},"2026-02":{v:2.5,o:"igcp"},"2026-03":{v:0,o:"igcp"}}}},"2026-03-15");
  assert.deepEqual([b("E","2026-01").v,b("E","2026-01").kind],[2.987,"derivada"]);
  assert.equal(b("E","2026-02").v,3.5);
  assert.equal(b("E","2026-03").kind,"estimada"); // F = 0: usa o mês anterior, marcado como estimado
  // um valor da Série E registado passa à frente do derivado
  const c=SE.rateBook({rates:{F:{"2026-01":{v:2,o:"igcp"}},E:{"2026-01":{v:2.9,o:"user"}}}},"2026-03-15");
  assert.equal(c("E","2026-01").v,2.9);
});

test("Livro de taxas: mês passado sem registo usa o anterior; sem anterior usa o valor por omissão antes do seguinte",()=>{
  const b=SE.rateBook({rates:{F:{"2026-07":{v:2.356,o:"igcp"}}},fallback:{F:2}},"2026-11-01");
  assert.deepEqual([b("F","2026-09").v,b("F","2026-09").kind],[2.356,"estimada"]);
  assert.deepEqual([b("F","2025-01").v,b("F","2025-01").kind],[2,"estimada"]);
  const c=SE.rateBook({rates:{F:{"2026-07":{v:2.356,o:"igcp"}}}},"2026-11-01");
  assert.equal(c("F","2025-01").v,2.356);
});
