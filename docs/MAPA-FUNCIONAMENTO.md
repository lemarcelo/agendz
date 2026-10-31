# Mapa de funcionamento do Agendz (v110)

Referência de **como a aplicação deve funcionar**, por perfil e por fluxo. Serve de roteiro para a varredura ponta a ponta (`tests/e2e67.mjs`) e para conferir se uma tela nova respeita as regras. A fonte da verdade das regras de negócio continua sendo `prompt-agendz-regras.md`; este mapa diz **o que cada pessoa vê e faz**.

Duas aplicações mostram o mesmo painel: o **Artifact** (demonstração, API simulada, `src/ui/App.jsx`) e o **site real** (API Spring Boot, `src/ui/real/AppReal.jsx`). O menu e as regras precisam ser **os mesmos nos dois**; o que só existe em um deles está na seção 9.

## 1. Perfis

| Perfil | Quem é | Vê a agenda de | Observação |
|---|---|---|---|
| `dono` (Proprietário) | quem contratou | todos | tudo; único que mexe em equipe, comissão, relatórios, regras, reconfigurar |
| `master` | acesso total interno (demonstração) | todos | igual ao dono |
| `admin` | gestor | todos | sem seção liberada de fábrica; o dono libera |
| `atendente` | recepção | todos | de fábrica: Agenda, Clientes, Serviços |
| `profissional` | barbeiro/esteticista | só a própria | de fábrica: Agenda, Clientes; vê os próprios ganhos; lança sempre como ele mesmo e só de hoje |
| `suporte` | usuário criado pelo Admin da plataforma em cada loja | — | escondido da equipe; nome reservado |
| Cliente | pessoa que agenda | só os próprios horários | link `#agendar`, WhatsApp; nunca vê quem ocupa um horário |
| Admin da plataforma | equipe Agendz (`agendz-admin`) | — | login com TOTP; nunca vê dados dos clientes finais |

Permissão: `pode()` lê `permissoes` (true/false) por cima de `PERMISSOES_PADRAO`. **Relatórios não é liberável** (dono e master; o profissional vê só os próprios números). No servidor: `@perm.pode(authentication,'secao')`, lido do banco a cada chamada. O botão escondido nunca basta.

## 2. Menu por perfil (igual no Artifact e no site real)

Um ícone distinto por aba (`tests/menu-icones.test.mjs`). **Não existe aba "Início"**: depois de entrar (e ao concluir o assistente) abre a **Agenda**; quem não tem Agenda abre Clientes, ou Serviços.

| Aba | Ícone | dono/master | admin | atendente | profissional |
|---|---|---|---|---|---|
| Agenda | calendar | sim | se liberada | sim | sim (só a dele) |
| Clientes | users | sim | se liberada | sim | sim |
| Serviços | tesoura/pincel do tipo | sim | se liberada | sim (leitura) | leitura |
| Equipe | team | sim | não | não | não |
| Boxes (estética) | car | sim | não | não | não |
| Planos | ticket | sim | se liberada | se liberada | não |
| Avaliações | star | sim (oculta com motivo) | se liberada | se liberada | "Minhas avaliações" (só as dele, mesmo sem a seção) |
| Cupons | tag | sim | com Estabelecimento | com Estabelecimento | não |
| Estoque | box | sim | se liberada | se liberada | se liberada |
| Estabelecimento | store | sim | se liberada | se liberada | não |
| Relatórios | list | sim | não | não | próprios números |
| Comissões | wallet | sim | não | não | não |
| Meus ganhos | gauge | — | sim | sim | sim |
| Avisos | bell | sim | com Agenda | com Agenda | com Agenda |
| Suporte | info | sim | sim | sim | sim |

**Plano na ficha do cliente** (Clientes > Editar, bloco "Plano"; só com a seção Planos, senão o bloco nem monta e a API de planos não é chamada): plano em andamento (saldo, vencimento, horários fixos no Artifact), histórico curto, "Sem plano" + Adicionar plano (sem plano cadastrado: aviso com atalho para Planos), Editar (trocar de plano com motivo, horários fixos, registrar mensalidade) e Encerrar. Usa as mesmas rotas da aba Planos; `tests/e2e90.mjs` (Artifact) e `tests/e2e91.mjs` (site real).

Só no Artifact: Mensagens (simulador de WhatsApp só nessa tela), Financeiro, Minha escala (profissional). Avaliações existe nos dois (v127: no site real a estrela do cartão faz Preparar → Abrir no WhatsApp, e a aba **Mensagens em lote** fica dentro de Avaliações; teste `tests/e2e100.mjs`).
Só no Artifact: Mensagens (simulador de WhatsApp só nessa tela; no Artifact a aba **Mensagens em lote** fica nela), Financeiro, Minha escala (profissional). Só no site real: nada a mais.

## 3. Entrar e primeiro acesso

1. **Login** (usuário + senha). Errado = mensagem genérica; senha errada em rota protegida é **403**, nunca 401 (o front derruba a sessão em 401).
2. **Senha temporária** (dono criado pelo Admin, equipe criada pelo dono): a pessoa escolhe **o usuário** (único na loja, minúsculas) e a senha definitiva. Depois entra sozinha: dono → assistente de primeiro acesso; demais → Agenda.
3. **Assistente do dono**: Serviços → Produtos → Equipe (comissão por pessoa) → **Boxes (só estética, v120: sem box a agenda não aceita carro; aditivo, respeita o limite de agendas do Admin)** → Expediente → **Link do cliente (B9a, v131: o que o cliente precisa informar no link: nome, telefone e, com veículo, placa/modelo/porte; padrão exige tudo; Pular mantém; também em Estabelecimento)** → Pronto. Reabre em Estabelecimento > Reconfigurar (senha do dono, 30 min, reversível por 30 dias; aditivo).
4. **Esqueci a senha**: sem canal configurado = pedir ao suporte (redefinição no painel).
5. **Meu perfil** (toque na foto/nome no topo): dados próprios, foto, senha, **digital do aparelho** (site real; cadastrar pede a senha), **redes confiáveis** e **aparelhos confiáveis** (listam e removem), som/faixa/vibração do aviso (ficam no aparelho).
6. **Login automático (v119, site real)**: caixa "Login automático" no login. Depois de entrar numa rede nova a tela pergunta "Deseja logar automaticamente?" com duas opções (v125): **neste Wi-Fi** (computador da loja, rede confiável) ou **só neste aparelho** (celular, aparelho confiável: continua logado em qualquer rede por até 1 ano de uso; sem uso por 90 dias termina); no celular a sugestão é o aparelho, no computador a rede. Sim guarda só o token longo neste aparelho; Agora não não guarda nada. Na rede confiável a sessão não vence e o site reabre sem login; em **outra rede** o acesso vale 1 dia e depois pede a digital ou a senha. A rede é o IP público visto pelo servidor (não o nome do Wi-Fi): trocar de internet = rede não reconhecida. Sair, trocar a senha, remover a rede, desativar a pessoa ou mudar o papel derrubam o token. A digital também aparece como sugestão no campo de usuário (`autocomplete="username webauthn"`).

## 4. Agenda

- **Horários** (cartões do dia + próximos 7 dias por vez, agrupados por dia) e **Calendário** (mês). Seletor único de profissional (Todos, seta). Cartão: data (no dia de hoje também a data, não a palavra "Hoje"), hora grande, cliente, serviço, profissional; no desktop os cartões formam **grade de tamanho igual**.
- **Estrela de avaliação** (v116): no cartão do atendimento **concluído com serviço**, confirma na tela e abre o `wa.me` (aba nova, mensagem e link prontos; o link também é copiado). Cliente **sem telefone válido**, **sem cadastro** ou que **não quer mensagens**: aviso na tela (`avaliar-sem-telefone`, `avaliar-sem-cadastro`, `avaliar-sem-mensagens`), nunca silêncio. Marca "Avaliação pedida em dd/mm" e depois "Avaliado". Futuro, cancelado e só produto não têm estrela.
- **Cancelados do dia** ficam numa linha "Cancelado (N)" no fim da lista; tocar abre os cartões (com o filtro Cancelado ligado ficam na lista).
- **Status**: a confirmar, confirmado, concluído, cancelado. Escolher à mão com horário já iniciado grava `statusManual` (o tick não conclui nem cancela). "Cliente agendou" é marcador visual sobre a confirmar (`origem: 'link'`).
- **Conflito de horário nunca duplica** (`validarHorario`/`acharConflitos`): a equipe pode sobrepor um pedido **a confirmar** (aviso; quem confirmar primeiro vence) e um confirmado só com **encaixe**; o **cliente** (link/WhatsApp) nunca ocupa horário pedido ou confirmado por outro. Estética: box também é recurso.
- **Estética sem box ativo (v120)**: **Atender** e **Link Agenda** não abrem; a Agenda avisa na tela e só o proprietário tem o botão "Cadastrar boxes" (leva a Boxes); os demais só leem o aviso. O servidor recusa (409) e a página do cliente fica indisponível.
- **Atender** (botão único): sem data/agora/passado = atendimento local concluído; futuro = agendamento. Só serviço ou só produto vale (futuro exige serviço). **Nada é obrigatório de fábrica**: sem telefone e sem cliente escolhido, o futuro fica **sem cadastro** (`nomeAvulso`), confirmado, sem mensagem. O dono marca nome/telefone/profissional/vendedor/forma de pagamento em Estabelecimento > Regras do atendimento (o que está gravado manda). Dia anterior exige motivo (5–300) e só dono/admin/atendente; profissional só hoje e como ele mesmo. v121: na estética as regras também listam veículo, placa, modelo e porte; o link tem nome e dados do veículo desmarcáveis.
- **Portes e ordem dos serviços (v122/v123/v124):** na estética o dono cadastra os portes em Estabelecimento > Portes (Médio fixo) e define o **fator** de cada um, vendo a prévia dos preços (com busca por serviço); o serviço tem o **preço base (Médio)** e a seção **Preço específico por porte**, que vale no lugar do fator. "Mais usados" conta os últimos 90 dias. Em Serviços, setas subir/descer definem a ordem; em Regras o dono escolhe "Mais usados primeiro" (padrão) ou "Minha ordem" para o Atender, o agendamento e o link do cliente.
- **Remarcar**: concluído nunca; cancelado só junto com status não cancelado. **Cancelar pelo cliente** só com 24 h ou mais, conferido na API.
- **Cupom**: só em agendamento futuro; chave gerada no servidor; resposta ao cliente genérica; 5 chaves erradas = 15 min de bloqueio.
- **Comissão**: serviço > profissional > geral; congelada no atendimento; trava depois de paga; só o dono vê percentuais e paga.

## 5. Cliente pelo link (`#agendar`)

Sem login. Etapas: (estética: veículo/porte) → serviço → horário → dados → pedido. O pedido entra **a confirmar**, `origem: 'link'`, máx. 3 abertos. Vê só horários livres. Acessa os próprios horários por token pessoal (um agendamento) ou telefone + código; **telefone sozinho nunca basta**. Cancela e remarca com 24 h ou mais. Lembretes de 24 h e 2 h só com aceite. Link desligado = 403. Botões e destaques seguem as cores do tema da loja.

## 5b. Avaliação do atendimento (`#avaliar/<token>`, v116)

Sem login. Token pessoal por agendamento (48 hex, só o hash guardado, 90 dias, uso único, um vivo por agendamento) no **fragmento**. De 1 a 5 estrelas, comentário opcional (até 500), caixa "Avaliar como anônimo". Token errado, vencido ou usado = a **mesma** mensagem genérica. A página nunca mostra o nome do cliente. No painel: **Anônimo** (sem nenhum campo de identidade no DTO) enquanto a regra da loja `avaliacaoMostraAnonimo` estiver desligada (padrão; só o Admin muda, com motivo; no Artifact é a caixa "Simular o Admin" da tela de entrada); ligada mostra o nome e "(avaliado como anônimo)". Dono oculta com motivo (não apaga). Profissional vê só as próprias; atendente/admin só com a seção `avaliacoes`. **Mensagens em lote** (aba da tela Mensagens, seção `avaliacoes`): período de atendimentos concluídos (máx. 366 dias) × profissional × serviço, só quem tem WhatsApp válido e não pediu para não receber, uma linha por pessoa, até 200; sem a API da Meta cada contato abre o `wa.me` (um clique por pessoa), com enviado/pular e pausa. Teste: `tests/e2e78.mjs`.

## 6. WhatsApp (simulado no Artifact)

Sem usuário: confere que o agendamento pertence ao número do remetente. Número do canal só vale em `55`+DDD+número. Cancelamento pelo cliente: 24 h ou mais. Mensagens só para quem tem cadastro (avulso e atendimento local não recebem). No site real fica adiado (por cliente, via Admin, com as chaves da Meta de cada loja).

## 7. Estabelecimento (dono/liberado)

Dados e endereço, logo e tema (cores só por `tema.js`), expediente e escala, regras do atendimento, link de agendamento, boxes (estética), cupons, comissão geral, reconfigurar. O tipo do estabelecimento **nunca muda** depois de criado. No site real o dono edita o **horário de funcionamento** (`Expediente.jsx`) e a **logo e cor do tema** (`MarcaLoja.jsx`).

## 8. Admin da plataforma e Suporte

- `agendz-admin`: criar clientes/subdomínios, usuários e regras (limite de usuários e de agendas, CPF/nascimento obrigatórios), situação (suspenso/encerrado = 402 na loja), domínio próprio por TXT, chamados. Toda escrita sensível pede motivo e grava na linha do tempo.
- **Suporte da loja**: o dono vê todos os chamados da loja, os demais só os seus; nota interna nunca chega ao cliente; o vínculo vem da sessão; outro usuário/loja = 404; Admin fora do ar = 503 genérico.

## 9. Diferenças conhecidas entre Artifact e site real

| Assunto | Artifact | Site real |
|---|---|---|
| Dados | API simulada em memória | API Spring Boot + PostgreSQL |
| Financeiro, Mensagens, Minha escala | existem | ainda não (adiado) |
| Pix / WhatsApp | simulados | adiados |
| Estética: Atender | completo | com veículo/porte/box |
| Primeiro acesso | pré-visualização (nada gravado) | grava |
| Login por digital | não existe (iframe) | existe (Meu perfil cadastra; tela de entrada tem "Entrar com a digital"; a senha continua valendo) |
| Avaliações e mensagens em lote | existem (fase 1) | ainda não (fase 2: `docs/F5-avaliacoes.md`) |
| Suporte com imagens | até 3 por mensagem (simulado) | até 3 por mensagem, bytes no banco do Admin |

## 10. Como a varredura usa este mapa

`tests/e2e67.mjs` entra com **cada perfil** no Artifact (claro e escuro; 390 px e desktop), confere: abas da tabela da seção 2, ausência de "Início", abertura na Agenda, ausência de rolagem lateral, nenhuma exceção na página, e que ações proibidas ao perfil não aparecem. A varredura do site real usa os mesmos perfis com a API simulada por rota (padrão dos `e2e4x`). Inconsistência achada vira teste e entra em `docs/DECISOES-E-DUVIDAS.md`.
