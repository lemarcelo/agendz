# F5: Avaliações e mensagens em lote (spec, 30/10/2026)

Pedido do dono (resumo): avaliação do atendimento pelo próprio cliente; estrela no card concluído que manda o pedido de avaliação; avaliação anônima com opção, no Admin, de revelar os dados (com a frase "avaliado como anônimo"); histórico para cada usuário, acesso à seção liberável por usuário; avaliações por serviço (cadastro do serviço) e por profissional; mensagens em lote por WhatsApp para quem concluiu serviço num período, sem depender da Meta.

## Regras (decididas sem confirmação)
1. **Quem avalia:** só quem tem atendimento **concluído** (`status = concluido`). Uma avaliação por agendamento; não se edita nem se apaga (o dono pode **ocultar** com motivo; ocultar não apaga).
2. **Como o cliente chega:** o painel gera um **token pessoal por agendamento** (aleatório, só o hash fica guardado, 90 dias, nunca na URL: `#avaliar` + token no fragmento, igual ao link do cliente v97). Sem token válido = resposta genérica. Telefone sozinho nunca basta.
3. **Nota** 1 a 5 (inteira, obrigatória). **Texto** opcional, até 500 caracteres, só como texto. **Anônimo**: caixa marcável na página do cliente.
4. **Anônimo e o Admin:** regra da loja no Admin `avaliacaoMostraAnonimo` (padrão **falso**). Falso: o painel da loja mostra "Anônimo" e o servidor **não envia** nome nem cadastro no DTO. Verdadeiro: mostra o nome real e a frase "(avaliado como anônimo)". Só o Admin muda (a loja nunca escolhe), com motivo, e o evento entra na linha do tempo.
5. **Estrela no card concluído** (Artifact e site real): abre a confirmação "Pedir avaliação ao cliente" → abre `wa.me` com a mensagem pronta e o link (padrão v63: aba nova, link copiado como reserva, nunca `whatsapp://`, sem `await` antes de abrir). **Cliente sem telefone** ou **atendimento sem cadastro**: aviso claro na tela ("cliente sem telefone"), nunca silêncio (lição do remarcar). Marca `a.avaliacaoPedida = { em, por }` (só visual: "pedida em dd/mm"); pedir de novo é permitido.
6. **Permissão:** nova seção `avaliacoes` (liberável pelo dono por usuário, como `planos`). Dono/master veem tudo. Profissional vê **só as próprias** (padrão) e o próprio resumo (média, total) mesmo sem a seção ampla; atendente/admin só com a seção liberada. Cadastro do serviço mostra as avaliações **daquele serviço** (quem tem a seção). Cliente nunca vê avaliação de outro.
7. **Resumo:** média (1 casa), total, distribuição 1 a 5, filtro por período, profissional e serviço; lista com data, estrelas, texto, serviço, profissional. Sem avaliação = estado vazio com texto.
8. **Por serviço:** o agendamento guarda `servicoIds`; a avaliação vale para todos os serviços do atendimento (e para o profissional). Produto sem serviço (só produto) não gera pedido de avaliação.
9. **Mensagens em lote (aba Mensagens, só dono e quem tiver `avaliacoes`/`mensagens`):** filtro por **período** de atendimentos concluídos (de/até, máx. 366 dias), por profissional e por serviço; lista só de quem tem telefone válido (`numeroWhatsapp`), sem repetir pessoa; modelo de texto com `{nome}` e `{link}` (link só quando for pedido de avaliação); mostra quantos ficaram de fora por falta de telefone. **Sem API da Meta não existe envio automático:** a tela é uma fila e cada contato abre o `wa.me` com a mensagem pronta (um clique por pessoa, botão "Próximo", marca enviado/pulou, pausa quando quiser). Limite de 200 por fila. Isso fica explícito na tela. Quem pediu para não receber (opt-out `semMensagens` no cadastro) fica fora.
10. **Privacidade:** o painel nunca mostra CPF; telefone mascarado na lista da fila; token nunca em log; texto do cliente escapado; texto de avaliação nunca vira HTML. Dados em `MAPA-DADOS-PESSOAIS.md`.

## Onde mexe
- `src/domain/avaliacoes.js` (puro: validar, resumir, filtrar, fila de mensagens) + `tests/avaliacoes.test.mjs`.
- `api.js`: `avaliacoes.pedir|listar|resumo|ocultar`, `publico.avaliar|dadosAvaliacao`, `mensagens.fila` (+ `docs/MAPA-API-SPRING.md`).
- UI Artifact: estrela no card concluído (`ui/Agenda.jsx`), `ui/Avaliacoes.jsx`, `ui/AvaliarPublico.jsx` (`#avaliar`), aba em Serviços, fila em Mensagens.
- Servidor: migração **V35** (`avaliacao`, `avaliacao_acesso`; `configuracao_loja`/`loja_regra_plataforma.avaliacao_mostra_anonimo`), `avaliacoes/`, rota pública sem login com limite (`LimitePublico`), `Permissoes` seção `avaliacoes`, Admin: regra no `RegrasDaLoja`.
- Site real: `ui/real/Avaliacoes.jsx`, `ui/real/AvaliarPublico.jsx`, estrela no cartão (`ui/real/Agenda.jsx`).
- Admin (`agendz-admin`): chave "Mostrar dados de quem avalia como anônimo" nas regras da loja.
- Testes (lição do remarcar): estrela em cliente com telefone, **sem telefone**, **sem cadastro**, card que sai da lista; anônimo com a regra ligada e desligada (DTO sem identidade); token errado/vencido/reusado; permissão por seção e por usuário; profissional só vê as suas; 390 px e desktop; claro/escuro; textos conferidos.

## Fase 1 (Artifact) feita em 30/10/2026 (v116)
`domain/avaliacoes.js` (puro) + `tests/avaliacoes.test.mjs` (domínio e API simulada), `api.js` (`avaliacoes.*`, `mensagens.*`, `publico.dadosAvaliacao|avaliar`, `store.simularAdmin` só na demonstração), UI (`ui/PedirAvaliacao.jsx`, `ui/Avaliacoes.jsx`, `ui/AvaliarPublico.jsx`, `ui/FilaMensagens.jsx`, estrela em `ui/Agenda.jsx`, aba **Mensagens em lote**, avaliações no cadastro do serviço, caixa `semMensagens` no cadastro do cliente), `tests/e2e78.mjs`. Mapa: `MAPA-API-SPRING.md` 10p.

Decisões tomadas sem confirmação:
- A fila em lote exige a seção `avaliacoes` (dono, master e quem o dono liberar); o profissional sem a seção não a vê.
- A estrela pede o pedido para quem tem Agenda e enxerga aquele agendamento (profissional só os dele). Cliente que pediu para não receber (`semMensagens`) também fica de fora da estrela, não só da fila.
- Pedir de novo troca o link anterior (um token vivo por agendamento). Uma avaliação por agendamento; o token é gasto ao avaliar.
- Quem avalia vê na caixa "anônimo" o aviso de que o nome só some se as regras do estabelecimento permitirem (a regra do Admin pode revelar): decisão de texto, o dono pode querer outro.
- O profissional sem a seção vê "Minhas avaliações" (lista e resumo); ocultas nunca aparecem para ele.
- Ocultar/reexibir: só dono/master, motivo de 5 a 200 letras, histórico no registro; oculta sai da média.
- Aviso geral (sem `{link}`) também existe na fila em lote; modelos aceitam só `{nome}`, `{loja}`, `{link}`.

## Fase 2 (o que falta)
- **Servidor:** migração V35 (`avaliacao`, `avaliacao_acesso` com `hash`, `fila_mensagem` e `fila_mensagem_item`, `cliente.sem_mensagens`, `agendamento.avaliacao_pedida_em/por`, `loja_regra_plataforma.avaliacao_mostra_anonimo`) com RLS como as demais; pacote `avaliacoes/` (service, controller, DTO sem identidade no anônimo); `Permissoes` seção `avaliacoes`; rotas públicas com token em `X-Acesso` e `LimitePublico`; `ClienteService` aceita `semMensagens`; testes Java equivalentes a `avaliacoes.test.mjs` (token vencido/errado/reusado, anônimo com a regra ligada e desligada sem identidade no JSON, profissional só as dele, fila: telefone/duplicado/limite 200/período) e casos em `equivalencia/avaliacoes.json`.
- **Site real:** `api-real.js` (`avaliacoes.*`, `mensagens.*`, `publico.*`), `ui/real/Avaliacoes.jsx`, `ui/real/AvaliarPublico.jsx`, estrela no cartão (`ui/real/Agenda.jsx`), aba de lote em Mensagens (hoje o site real não tem Mensagens), item no menu com o ícone `star` (`tests/menu-icones.test.mjs`), `semMensagens` na ficha do cliente; `tests/api-real-avaliacoes.test.mjs` e e2e equivalente a `e2e78`.
- **Admin (`agendz-admin`):** chave "Mostrar dados de quem avalia como anônimo" nas regras da loja, com motivo e linha do tempo; `RegrasDaLoja` aplica no servidor da loja.
- **Meta/WhatsApp oficial:** quando existir a API por loja (v100), a fila pode virar envio automático; até lá fica um clique por pessoa.

