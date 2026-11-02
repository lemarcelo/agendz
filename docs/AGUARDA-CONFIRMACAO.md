# Aguarda confirmação do Marcelo (nada daqui é feito sem ele dizer "pode")

Lista à parte do `BACKLOG-FUTURO.md`. Item aqui **não entra na fila de trabalho**: só sai desta lista quando o Marcelo confirmar por escrito (data e hora no item).

| Item | O que é | Por que espera | Confirmado em |
|---|---|---|---|
| **Financeiro real** | lançamentos, contas, conciliação e pagamento de comissão no servidor (hoje o site real só registra); branch `feat/financeiro` já existe | mexe com dinheiro; decisão de escopo e ordem é do Marcelo | — |
| **Pix** | cobrança, conferência de pagamento e conciliação por Pix/Open Finance, por cliente (chaves de cada loja) | dinheiro e chaves de terceiros; já adiado ("WhatsApp/Pix não serão configurados agora") | — |
| **reCAPTCHA no login** | proteção anti-robô no login e no acesso do cliente ao autoatendimento (`docs/BACKLOG-FUTURO.md` B4 e B10) | **CONFIRMADO em 31/10 13:36 e FEITO na v139** (saiu da espera; chaves `RECAPTCHA_CHAVE_SITE`/`RECAPTCHA_SEGREDO` no `.env` da VPS ligam o recurso) | 31/10 13:36 (feito v139) |

Regra de trabalho: ao terminar a fila, **não** pegar item desta lista sozinho; perguntar.
