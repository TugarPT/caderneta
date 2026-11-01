# Sincronizar telemóvel e computador por QR

Código-fonte de **Definições → Sincronizar telemóvel e computador**. O `index.html` da raiz já o inclui; estes ficheiros servem para o rever, testar e voltar a aplicar.

Um aparelho mostra um QR animado, o outro lê-o com a câmara. Sem internet, sem contas, sem servidores.

| Ficheiro | O que é |
|---|---|
| `sync_engine.js` | Motor puro: Base45, CRC32, código de fonte (blocos + combinações XOR, eliminação de Gauss), plano de junção |
| `sync_engine.test.js` | Testes, incluindo ida e volta com QR reais (qrcode-generator → jsQR) |
| `sync_ui.js`, `sync.css`, `sync_card.html`, `sync_dialog.html` | Interface |
| `vendor/` | jsQR 1.4.0 (Apache-2.0) e qrcode-generator 1.4.4 (MIT), minificados, embutidos no HTML |
| `sync_patch.py` | Aplica tudo a um `index.html`/`caderneta.html` (idempotente, marcador `id="syDlg"`) |

```
node --test dev/sync/*.test.js
```

## Como funciona
- **Envio**: JSON `{app,t:"sync",v,at,items,meta}` → deflate (`CompressionStream`) → blocos de 300 bytes. Cada QR (versão 13, correção M, modo alfanumérico) leva `CAD1:` + Base45 de 18 bytes de cabeçalho (sessão, K, tamanho, CRC32, nº) + um bloco. Voltas alternadas: blocos simples, depois combinações aleatórias densas. Quem recebe pode perder qualquer QR; com K partes independentes reconstrói tudo e confere o CRC32.
- **Leitura**: `BarcodeDetector` quando o navegador tem (Android), senão jsQR sobre o centro da imagem (computador).
- **Junção**: `localStorage["caderneta.sync"] = {mod:{id:ms}, del:{id:ms}}` é preenchido por `Store.putMany/delMany`. Ganha a alteração mais recente; em empate (dados antigos sem hora) ganha o que chega, para que "enviar e enviar de volta" deixe os dois iguais. Apagados viajam (guardados 180 dias). "Substituir tudo" deixa o aparelho igual ao outro.
- **Segurança**: o ecrã de revisão mostra novos/atualizados/apagados antes de mudar; antes de aplicar guarda `caderneta.preSync` para **Desfazer**.
- Fotos dos talões não vão no QR (ficam no aparelho; usar a Cópia de segurança).
- Sem câmara: "Enviar como ficheiro" (partilha do Android ou transferência) e "Abrir ficheiro" no outro lado, com a mesma junção.

## Ligação direta (só o telemóvel lê um QR, nos dois sentidos)
`sync_link.js`. "Mostrar código" (computador) mostra um QR com `…/caderneta/#sy=<tópico>.<chave>` (chave AES-GCM de 128 bits).
O telemóvel lê-o (na app, ou com a câmara do Android, que abre o endereço) e os dois combinam uma ligação WebRTC
trocando oferta/resposta por um tópico do **ntfy.sh** (grátis, sem conta), cifradas com a chave do QR: o serviço só vê texto ilegível.
STUN: Google e Cloudflare (grátis). Os dados vão por um DataChannel (DTLS), direto entre aparelhos, nos dois sentidos ao mesmo tempo;
cada lado revê e junta com desempate estável (`plan(..., "stable")`), por isso ficam iguais.
Precisa de internet só para combinar a ligação. Funciona melhor com os dois na mesma rede Wi-Fi.
O teste ponta a ponta troca o ntfy por um falso (Playwright, dois contextos, WebRTC real).
