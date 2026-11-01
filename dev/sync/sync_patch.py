#!/usr/bin/env python3
"""Sincronizar telemóvel e computador por QR animado (Definições → Sincronizar).

Uso: python3 sync_patch.py in.html out.html   (idempotente: marcador id="syDlg")
Lê, ao lado deste ficheiro: sync_engine.js (motor puro, testes em sync_engine.test.js), sync_ui.js, sync.css,
sync_card.html, sync_dialog.html e vendor/ (jsQR 1.4.0, Apache-2.0; qrcode-generator 1.4.4, MIT), tudo embutido no HTML.

Dados: localStorage "caderneta.sync" = {mod:{id:ms}, del:{id:ms}} (hora de cada alteração/apagar, guardada pelo
Store.putMany/delMany), "caderneta.preSync" (ponto de restauro antes de juntar), "caderneta.syncAt".
"""
import sys, pathlib

here = pathlib.Path(__file__).resolve().parent
src = open(sys.argv[1], encoding="utf8").read()
if 'id="syDlg"' in src:
    sys.exit("already patched")
rd = lambda n: (here / n).read_text(encoding="utf8")

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit("anchor count %d != %d: %s" % (n, count, old[:100]))
    src = src.replace(old, new)

rep("\n</style>", "\n" + rd("sync.css") + "</style>")
rep('      <div class="card">\n        <h3>Cópia de segurança</h3>', rd("sync_card.html") + '      <div class="card">\n        <h3>Cópia de segurança</h3>')
rep('<dialog id="bkDlg"', rd("sync_dialog.html") + '<dialog id="bkDlg"')
libs = ('<script>/*! jsQR 1.4.0 | (c) Cosmo Wolfe | Apache-2.0 | github.com/cozmo/jsQR */\n' + rd("vendor/jsQR.min.js").strip() + '\n</script>\n'
        '<script>/*! qrcode-generator 1.4.4 | (c) 2009 Kazuhiko Arase | MIT | github.com/kazuhikoarase/qrcode-generator */\n' + rd("vendor/qrcode.min.js").strip() + '\n</script>\n')
assert '</script' not in libs[8:-10].replace('\n</script>\n<script>', '')
rep('<script>\n/* ---------- constants & helpers ---------- */', libs + '<script>\n/* ---------- constants & helpers ---------- */')
rep('/* ask the browser to keep this data even when space runs low */', rd("sync_engine.js").replace('if(typeof module!=="undefined")module.exports=SYQ;\n', '') + '\n' + rd("sync_ui.js") + '\n' + rd("sync_link.js") + '\n/* ask the browser to keep this data even when space runs low */')
faq = ('<details><summary>Como passo os dados entre o telemóvel e o computador?</summary><p>Abre a Caderneta nos dois. No computador vai a Definições → Sincronizar e carrega em “Mostrar código”. No telemóvel carrega em “Ler código” e aponta a câmara (só o telemóvel precisa de câmara). Os dois trocam os dados nos dois sentidos de uma vez. Antes de mudar alguma coisa, cada um mostra o que entra, o que muda e o que é apagado, e deixa escolher entre juntar (recomendado) ou substituir tudo: confirma nos dois. Precisa de internet só para combinar a ligação; os dados vão diretos entre os aparelhos. Sem internet, usa “Enviar por QR animado”: um mostra, o outro lê, um sentido de cada vez. Não há contas nem pagamentos. As fotos dos talões não vão no QR; para essas usa a Cópia de segurança.</p></details>\n      ')
rep('<details><summary>Onde ficam os meus dados?</summary>', faq + '<details><summary>Onde ficam os meus dados?</summary>')
open(sys.argv[2], "w", encoding="utf8").write(src)
print("ok", len(src))
