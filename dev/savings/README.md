# Poupanças · Certificados de Aforro

Código-fonte da secção **Poupanças** da Caderneta. O `index.html` da raiz já o inclui; estes ficheiros servem para o rever, testar e voltar a aplicar.

| Ficheiro | O que é |
|---|---|
| `savings_engine.js` | Motor de cálculo puro (sem DOM, sem rede): regras oficiais, livro de taxas, Série F/E, séries antigas, CT, contas, depósitos, IRS, TIR, simulador |
| `savings_engine.test.js` | Testes unitários, com os valores esperados calculados à mão nos comentários |
| `savings_ui.js`, `savings.css`, `savings_tab.html`, `savings_dialogs.html` | Interface |
| `savings_patch.py` | Aplica tudo a um `index.html`/`caderneta.html` (idempotente, marcador `id="psubs"`) |

Correr os testes (Node 18+):

```
node --test dev/savings/*.test.js
```

## Separação dos dados
- **Regras oficiais**: `SE.RULES` (fonte e data de consulta em cada série). Mudar uma regra = mudar só esta tabela.
- **Taxas oficiais**: `SV_SEED` em `savings_ui.js` (valores do IGCP com fonte) + taxas que o utilizador regista (doc `savcfg`).
- **Hipóteses**: `savcfg.proj` (taxa base futura) e o simulador. Aparecem sempre marcadas como hipotéticas.
- **Resultados**: calculados em cada render, nunca guardados.

## Regras da Série F (ficha de produto IGCP, Portaria 149-A/2023)
Taxa base = média da Euribor 3M dos 10 dias úteis anteriores, 3 casas decimais, entre 0% e 2,50%, fixada no antepenúltimo dia útil do mês para o mês seguinte. Taxa de cada trimestre = taxa base no início do trimestre + prémio de permanência (anos 2–5: 0,25; 6–9: 0,50; 10–11: 1,00; 12–13: 1,50; 14–15: 1,75). Juros trimestrais no dia da subscrição (se o dia não existir, dia 1 do mês seguinte), capitalizados líquidos de IRS. Resgate a partir do 1.º vencimento. Prazo 15 anos.

Arredondamento: juros brutos e IRS ao cêntimo em cada vencimento (o IGCP trabalha por unidades; pode haver diferenças de cêntimos).
