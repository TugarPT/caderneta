#!/usr/bin/env python3
"""Poupanças: Certificados de Aforro (Séries A–F), Certificados do Tesouro, contas poupança, depósitos a prazo,
simulador de cenários, calendário de vencimentos, histórico de capitalizações, resgates e tabela de taxas oficiais.

Uso: python3 savings_patch.py in.html out.html   (idempotente: marcador id="psubs")
Lê, ao lado deste ficheiro: savings_engine.js (motor puro, com testes em savings_engine.test.js),
savings_ui.js, savings.css, savings_tab.html, savings_dialogs.html.

Dados: kind "caf" (cada subscrição; campos novos opcionais name, inst, rate0, rates{k}, rateM, termY, irs, acct, payAt, note, amount0),
kind "sav" (outros produtos), doc "savcfg" (taxas base mensais, cenário, impostos), kind "savsim" (cenários guardados).
cafCalc() passa a usar o motor, por isso Investimentos → Aforro mostra os mesmos números que Poupanças.
"""
import sys, pathlib

here = pathlib.Path(__file__).resolve().parent
src = open(sys.argv[1], encoding="utf8").read()
if 'id="psubs"' in src:
    sys.exit("already patched")
rd = lambda n: (here / n).read_text(encoding="utf8")

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit("anchor count %d != %d: %s" % (n, count, old[:100]))
    src = src.replace(old, new)

# 1. CSS
rep("\n</style>", "\n" + rd("savings.css") + "</style>")

# 2. Poupanças: botões, sub-abas e painéis (as metas passam para a sub-aba Metas)
rep('<p id="poupSub">As tuas metas e quanto falta para cada uma.</p></div><button class="btn primary" type="button" data-gnew>+ Nova meta</button></div>\n    <div class="goals ggrid" id="goalsAll"></div>\n  </section>',
    '<p id="poupSub">As tuas metas e quanto falta para cada uma.</p></div><div class="actions"><span class="actions" id="svActs"><button class="btn" type="button" data-svnew="sav">+ Outro produto</button><button class="btn primary" type="button" data-svnew="caf">+ Certificados de Aforro</button></span><button class="btn primary" type="button" data-gnew>+ Nova meta</button></div></div>\n'
    + rd("savings_tab.html") + '      <div class="goals ggrid" id="goalsAll"></div>\n    </div>\n  </section>')

# 3. diálogos
rep('<dialog id="cafDlg">', rd("savings_dialogs.html") + '<dialog id="cafDlg">')

# 4. motor: as taxas da Série F/E vêm do livro de taxas (oficiais + registadas), com a taxa antiga das Definições como recurso
rep('const cafBase=()=>{const b=settings().cafBase;return b!=null&&isFinite(+b)?+b:2};',
    'const cafBase=()=>{const v=svBaseNow("F");if(v!=null)return v;const b=settings().cafBase;return b!=null&&isFinite(+b)?+b:2};')
old_calc_start = 'function cafCalc(c,B){'
i = src.index(old_calc_start); j = src.index('\nconst pct2=', i)
src = src[:i] + ('/* valor de uma subscrição: motor SE (juros trimestrais compostos, prémios, IRS, resgates); ver Poupanças */\n'
    'function cafCalc(c,B){const r=svRunOf(c).r,t=todayISO(),nx=r.next,ref=nx||r.last,past=r.events.filter(e=>e.past).length;\n'
    '  const cur=ref?{base:ref.rate.base!=null?ref.rate.base:(ref.rate.gross||0),prem:ref.rate.prem||0,gross:ref.rate.gross||0}:{base:0,prem:0,gross:0};\n'
    '  return{v:SE.wealthAt(r,t),n:past,cur,next:nx?nx.date:null,nextNet:nx?nx.net:0,matured:!!(r.matured&&r.matured.d<=t)}}') + src[j:]

# 5. saldos das contas: subscrições, resgates, depósitos e juros pagos movem a conta associada (nunca são receita/despesa)
rep('+xferFx(a,skip)+lmovFx(a)}', '+xferFx(a,skip)+lmovFx(a)+svFx(a)}')
rep('  if(t==="subscricoes")renderSubs();', '  if(t==="subscricoes")renderSubs();\n  if(t==="poupancas")renderSav();')
rep('[k.caf,"certificados"],', '[k.caf,"certificados"],[k.sav,"produtos de poupança"],[k.savsim,"cenários"],')

# 6. código (antes do arranque, porque o primeiro render corre logo)
rep('/* boot */', '/* ---------- motor de poupanças ---------- */\n' + rd("savings_engine.js") + '\n' + rd("savings_ui.js") + '\n/* boot */')

open(sys.argv[2], "w", encoding="utf8").write(src)
print("ok", len(src))
