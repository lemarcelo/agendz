# Mapa `api.js` → Spring Boot

Fonte: `src/services/api.js` (v41). Cada linha liga um método do protótipo ao endpoint, à permissão, à validação, à regra de domínio e aos testes que já cobrem o comportamento (Node) e que viram teste de integração (JUnit) em `backend-esqueleto/`.

Convenções: **Perm.** = quem pode. `agenda`, `clientes`, `servicos`, `estoque`, `financeiro`, `estabelecimento` são as seções de `R.pode(usuario, seção)`. Dono e master podem tudo; admin só as seções marcadas; esteticista só `agenda` (apenas os próprios agendamentos), `clientes` e `relatorios`. **Dono do nº** = o número que escreve pelo WhatsApp é o do cadastro (`telefoneDoCanal`).

## 0. Regras transversais (valem para todos os endpoints)

| Protótipo | Spring Boot |
|---|---|
| `mutate(fn, meta)` | `@Transactional` no serviço; regra violada = `RegraDeNegocioException` com rollback e mensagem em português; só grava se deu certo |
| `E.tick` + `ganchos` | `@Scheduled(fixedDelay = 60s)` + chamada após cada operação; eventos de domínio na mesma transação |
| `store.avancar` / `now()` | `Clock` injetável (`Clock.fixed` nos testes) |
| `usuario()` / `exigir(seção)` | Spring Security (JWT ou sessão) + `@PreAuthorize("@perm.pode(#auth, 'financeiro')")` |
| `meuAgendamento(id)` | `@perm.meuAgendamento(#auth, #id)`: existe, o usuário tem `agenda`, e esteticista só o dele. Resposta **404** (não 403) para não revelar existência |
| `doRemetente(id, tel)` / `donoDoNumero` | `@RemetenteWhatsApp` (filtro que valida a assinatura do webhook e extrai o número do **canal**, nunca do corpo) + `donoDoNumero(cliente, numero)` |
| `pegar(obj, campos)` + `texto` + `finito` + `limparTexto` | DTO `record` com Bean Validation (`@Size`, `@Pattern`, `@DecimalMin/@DecimalMax`) e `@JsonIgnoreUnknownProperties(false)` (campo desconhecido = 400); `LimparTexto` (NFC, sem controle, máx. 2 marcas combinantes) num `Converter` |
| `LIMITE_CRESCIMENTO` (150 KB por operação) | limite de corpo (`server.tomcat.max-http-form-post-size`, `spring.codec.max-in-memory-size`) e tamanho máximo por campo |
| `erro()` / `semPermissao()` | `@ControllerAdvice`: 400 validação, 401 sem login, 403 sem permissão (seção), 404 não é seu, 409 conflito de horário/idempotência, 422 regra de negócio |
| `semUsuarioSenha`, `cpfMascarado` | DTOs de resposta próprios; **nunca** devolver a entidade JPA |
| `MODO_DEMO` | `@Profile("dev")`; em produção o código de recuperação só sai pelo canal |

## 1. Autenticação

| Método JS | Endpoint | Perm. | Entrada / validação | Domínio e regra | Testes Node → JUnit |
|---|---|---|---|---|---|
| `auth.login` | `POST /auth/login` | pública | `identificador` ≤ 200, `senha` string; resposta de erro sempre igual | 5 erros bloqueiam 15 min por conta **e por IP** (Redis); chave normalizada (CPF só dígitos); tabela com teto, descarta só chaves sem bloqueio | `security.test` (login), `coerencia.test` → `AuthSecurityIT` |
| `auth.logout` | `POST /auth/logout` | logado | — | invalida o token (lista de revogação) | `AuthSecurityIT` |
| `auth.iniciarRecuperacao` | `POST /auth/recuperar` | pública | `cpf`, `telefone`, `canal` (whatsapp\|email) | código de 6 dígitos (SecureRandom), vale 30 min, só o último; **máx. 5 pedidos por CPF por hora**; o código sai só pelo canal | `security.test`, `coerencia.test` → `AuthSecurityIT` |
| `auth.concluirRecuperacao` | `POST /auth/redefinir` | pública | `cpf`, `codigo`, `senha` 4–100 | uso único, 5 tentativas erradas invalidam; erro igual para errado e expirado; libera só o bloqueio de quem recuperou | `security.test` → `AuthSecurityIT` |
| `equipe.alterarSenha` | `PUT /usuarios/me/senha` (**feito**, `SenhaController`; v80: `usuario` opcional = login escolhido pela própria pessoa no primeiro acesso, `^[a-z0-9._-]{2,60}$`, único na loja, 409 se já existe, conferido só depois da senha atual) | logado | `senhaAtual`, `nova` **8–100** (mudou de 4 para 8 em 27/10/2026) e diferente da atual; 5 erros bloqueiam 15 min; token de senha temporária (`trocar`) só aceita esta rota | BCrypt/Argon2; confere a senha atual | `security.test` → `AuthSecurityIT` |

## 2. Agenda (painel)

| Método JS | Endpoint | Perm. | Entrada / validação | Domínio e regra | Testes |
|---|---|---|---|---|---|
| `agenda.criar` | `POST /agendamentos` | `agenda`; esteticista só com `profissionalId` próprio | `clienteId`, `profissionalId`, `servicoIds` 1–10 sem repetir, `inicio` (minuto exato, ≤ 400 dias), `status`, `encaixe`, `cupomChave` (opcional: cupom recusado = agendamento não criado) | `E.criarAgendamento` → `validarHorario` (escala, exceções, antecedência, sobreposição por duração + intervalo); gancho `aposCriar` (aviso "revisar") | `domain`, `conflitos` → `AgendaConflitoIT` |
| `agenda.validar` | `GET /agendamentos/validar` | `agenda`; esteticista só o próprio | mesmos campos, sem gravar | `R.validarHorario`: devolve `erros`, `pendentes`, `confirmados` | `domain` |
| `agenda.remarcar` | `PUT /agendamentos/{id}/remarcar` | `meuAgendamento`; esteticista não repassa a outro | `inicio`, `status`, `profissionalId` | `E.profissionalRemarca`: etiqueta Reagendado, log, notificações novas; revalida horário; **concluído nunca** (reabra pelo status); **cancelado só com `status` não cancelado** (reativa e valida no horário novo) | `domain`, `conflitos` |
| `agenda.cancelar` | `POST /agendamentos/{id}/cancelar` | `meuAgendamento` | — | `E.profissionalCancela` (sem prazo); Pix pendente cancelado, Pix pago gera aviso "devolver" | `domain`, `acerto` |
| `agenda.alterarStatus` | `PUT /agendamentos/{id}/status` | `meuAgendamento` | `status` ∈ {a_confirmar, confirmado, concluido, cancelado} | `E.profissionalAlteraStatus`; **escolha manual com o horário já iniciado** grava `statusManual` e os jobs (`E.tick`) não concluem nem cancelam esse agendamento (nem avisam o cliente) até remarcar; confirmar cancela pendentes conflitantes | `domain`, `conflitos` |
| `agenda.editarServicos` | `PUT /agendamentos/{id}/servicos` | `meuAgendamento` | `servicoIds` lista 1–10 | `E.profissionalEditaServicos`: revalida horário, preço congelado dos que ficam; diferença paga vira aviso (nunca envia sozinho) | `domain`, `acerto` |
| `agenda.confirmarServico` | `POST /agendamentos/{id}/confirmacao-servico` | `meuAgendamento` | `feitos` ⊆ serviços, sem repetir | `E.confirmarServico`: só confirmado → concluído | `domain` |
| `agenda.iniciarServico` | `POST /agendamentos/{id}/iniciar-servico` | `meuAgendamento` | — | `E.iniciarServico`: marcador **Em serviço** sobre o status Confirmado (não é um status novo); recusa cancelado, concluído e a confirmar | `apex` |
| `agenda.marcarPronto` | `POST /agendamentos/{id}/pronto` | `meuAgendamento` | — | `E.marcarPronto`: marcador **Pronto para retirada**; envia o modelo `carro_pronto` **uma vez**; a conclusão automática espera até 24 h (`PRAZO_RETIRADA_MS`) | `apex` |
| `agenda.desmarcarAndamento` | `DELETE /agendamentos/{id}/andamento/{qual}` | `meuAgendamento` | `qual` ∈ {emServico, pronto} | `E.desmarcarAndamento`: desliga o marcador ligado por engano (pronto antes de em serviço) | `apex` |
| `agenda.enviarMensagem` | `POST /agendamentos/{id}/mensagens` | `meuAgendamento` | `modeloId`, `valores[]` | `E.enviarMensagemDoEsteticista`; **modelos só do sistema (`credito_registrado`, `credito_vencendo`, `ddd`) recusados** | `coerencia` |
| `agenda.atender` | `POST /atendimentos` | `agenda`; esteticista só na própria agenda e vende como ele mesmo | `servicoIds` ≤10, `produtos` ≤10 (`materialId`, `qtd`), `inicio` finito; ≥1 serviço ou produto; **sem data ou data ≤ agora = atendimento já feito** (concluído nessa data, até 400 dias atrás), **data futura = agendamento** (exige serviço e telefone; `status` a_confirmar/confirmado; `encaixe`; `cupomChave`); campos obrigatórios por tipo vêm de `estabelecimento.camposObrigatorios` (`nome`, `telefone`, `esteticista`, `vendedor`, `formaPagamento`); telefone cria o cadastro do cliente (ou usa o existente, que **sobrescreve o `clienteId` escolhido** se o telefone for de outro cadastro; nome mais longo que contém o antigo atualiza o cadastro), só nome não; tudo numa transação | `atender` | **v84:** data anterior a hoje exige `motivoRetroativo` (5–300) e só dono/admin/atendente (profissional só hoje); comissão de período já pago vai ao próximo pagamento (`comissaoEm`).
| `agenda.registrarLocal` | `POST /atendimentos-locais` | `agenda`; esteticista só em si mesmo | `formaPagamento` ∈ {pix, dinheiro, cartao} (sem informar, o padrão do estabelecimento; sem padrão, obrigatória), `servicoIds` 0–10 (zero só com produto: **venda de produto sem serviço**), `produtos` opcional (até 10, `materialId` + `qtd`), ao menos um serviço ou um produto, `nome` opcional ≤ 60, `telefone` opcional (10 ou 11 dígitos após tirar o 55), `profissionalId` (obrigatório com serviço), `vendedorId` (quem vende os produtos: pessoa da equipe, menos a conta técnica; sem serviço é obrigatório para quem não é esteticista; esteticista é sempre o próprio vendedor) | `E.registrarAtendimentoLocal`: nasce **concluído**, hora = agora, sem conflito de horário, (desde a v57 criado por `agenda.atender`, que cria cadastro por telefone) se o telefone (DDD + número, só dígitos) já existe em `clientes`, vincula esse cliente (`clienteId`; com mais de um no número vale o de mesmo nome, senão o primeiro); se não, `clienteId` nulo com `nomeAvulso` e `telefoneAvulso`; sem mensagem/Pix/cupom/remarcação; baixa estoque; congela preço e percentual de comissão; venda só de produto fica na coluna do vendedor (se atende) ou do primeiro esteticista que atende; entra em relatório e comissão, não no financeiro | `comissao` |
| `comissoes.relatorio` | `GET /comissoes?mes=` ou `?de=&ate=` | **dono/master** | `mes` finito **ou** `de`+`ate` (dias inclusive, até 366 dias, `ate ≥ de`) | por beneficiário (esteticista ou vendedor): atendimentos em que tem parte, valor, comissão, parte do estabelecimento, pago, a pagar; dono não recebe comissão (100%) | `comissao` |
| `comissoes.meuMes` | `GET /comissoes/meu?mes=` ou `?de=&ate=` | **esteticista, atendente e admin** (só o próprio) | `mes` finito **ou** `de`+`ate` | DTO **sem** valor cheio, parte do estabelecimento, percentual nem custo de material: só serviços e produtos dele (inclui produto que vendeu em atendimento de outro esteticista), `receber`, pago/a receber | `comissao` |
| `comissoes.pagar` | `POST /comissoes/pagamentos` | **dono/master** | `profissionalId`, `mes` **ou** `de`+`ate` | marca como pagas as partes em aberto da pessoa no mês (`comissaoPaga` do atendimento para o esteticista; `comissaoPaga` na linha do produto para o vendedor) e lança despesa "Comissões" no financeiro; não paga duas vezes (restrição no banco por parte); transação única | `comissao` |
| `comissoes.cancelar` | `POST /agendamentos/{id}/comissao/cancelar` | **dono/master** | `motivo` 5–300 obrigatório | `D.cancelarComissao`: recusa comissão já paga; zera a parte do beneficiário (`comissaoOriginal` guarda o valor), grava no histórico; o pagamento ignora a parte cancelada | `comissao` |
| `comissoes.restaurar` | `POST /agendamentos/{id}/comissao/restaurar` | **dono/master** | — | `D.restaurarComissao`: devolve o valor original, grava no histórico | `comissao` |
| `agenda.adicionarServicos` | `POST /agendamentos/{id}/servicos` | `meuAgendamento` | `servicoIds` 1–10, nenhum já presente, total ≤ 10; agendamento não cancelado | `E.adicionarServicosAoAgendamento`: **o status não muda**; revalida horário se a confirmar/confirmado; congela preço e percentual de comissão; em concluído/local o serviço entra em `servicosFeitos` e só a diferença baixa estoque; gancho `aposEditarValores` | `produtos` |
| `agenda.adicionarProduto` | `POST /agendamentos/{id}/produtos` | `meuAgendamento` | `materialId` de material **tipo produto** ativo, `qtd` inteira 1–999 (soma por produto ≤ 999), até 10 produtos, estoque suficiente, não cancelado, `vendedorId` opcional (só recepção/gestão escolhe; esteticista vende como ele mesmo; produto já na linha com outro vendedor é recusado) | preço de venda e percentual de comissão do produto congelados; soma ao total do atendimento (não entra em cupom; comissão do esteticista do atendimento só se o produto tem percentual); sai do estoque só quando concluído (concluído/local: na hora, pela diferença) | `produtos` |
| `agenda.removerProduto` | `DELETE /agendamentos/{id}/produtos/{materialId}` | `meuAgendamento` | produto precisa estar no atendimento | estorna a diferença no estoque se já tinha baixado; log "produtos" | `produtos` |
| `agenda.marcarAvisoLido` | `PUT /avisos/{id}/lido` | logado; esteticista só os seus | — | idempotente | `security` |

## 3. Clientes e vínculo de número

| Método JS | Endpoint | Perm. | Validação | Regra | Testes |
|---|---|---|---|---|---|
| `clientes.salvar` | `POST /clientes`, `PUT /clientes/{id}` | `clientes`; **trocar telefone de cadastro existente: dono, admin com Clientes ou o esteticista que atende o cliente (ou cadastro novo sem horários)**; toda troca grava o número antigo e quem trocou | `nome` obrigatório, CPF válido e único, telefone ≥ 10 dígitos, textos ≤ 100; **`veiculos`**: até 10, placa antiga (ABC-1234) ou Mercosul (ABC1D23), modelo e porte obrigatórios, marca e cor opcionais, placa única por cliente, `id` sempre gerado no servidor | veículo com agendamento ativo não é removido; duplicidade telefone+nome recusada; mensagem não revela de quem é o CPF | `domain`, `security` |
| `clientes.aprovarVinculo` | `POST /clientes/vinculos/{id}/aprovar` | `podeAutorizarVinculo` (dono ou admin com Clientes; **esteticista não**) | `id` ≤ 50 | troca telefone, guarda `telefonesAnteriores`; pedido já respondido não decide de novo; se o CPF mudou, encerra | `domain`, `security` |
| `clientes.recusarVinculo` | `POST /clientes/vinculos/{id}/recusar` | idem | idem | mesmo número não gera novo pedido para o cadastro | idem |

**Implementado no servidor real (v81, F2 parte 2):** `GET /api/clientes?q=`, `GET /api/clientes/{id}`, `POST /api/clientes`, `PUT /api/clientes/{id}` com as regras acima (telefone, CPF e nascimento cifrados; CPF completo e troca de telefone só para dono, quem atende ou cadastro sem horários; veículos só no tipo com `usaVeiculo`). Diferenças conhecidas: o servidor só tem os papéis dono e profissional (sem admin com permissão de Clientes); a mensagem de telefone alterado diz "profissional" (a simulada usa o rótulo do tipo); a trava de veículo com agendamento ativo entra com a agenda. Casos compartilhados: `backend/src/test/resources/equivalencia/clientes.json`.

## 4. Serviços, equipe, estabelecimento, escalas e modelos

| Método JS | Endpoint | Perm. | Validação | Regra | Testes |
|---|---|---|---|---|---|
| `servicos.salvar` | `POST /servicos`, `PUT /servicos/{id}` | `servicos` | **`precos` e `duracoes` por porte** (pequeno, medio, grande, suv, pickup; sem tabela, vale `preco`/`duracao` único; `preco`/`duracao` espelham o médio), duração 1–1440 (serviço `multiDia`: até 10 dias), preço 0–100 mil, `multiDia` e `categoria` só mudam quando vêm na chamada, `combo` + `componentes` (2–10 serviços comuns, sem combo dentro de combo), intervalo e antecedência ≥ 0, notificações ≤ 10; `codigo` opcional (≤ 20, `[A-Za-z0-9._-]`, único entre serviços, vazio = próximo número); `comissaoPct` 0–100 ou vazio (só o dono grava; para os outros o campo é ignorado) | mudar duração não pode sobrepor confirmados | `domain`, `conflitos` |
| `servicos.remover` | `DELETE /servicos/{id}` | `servicos` | — | com histórico ou dentro de combo, só desativa (200 `{desativado:true}`); nunca usado = apaga (204) | `domain` |

> **Servidor real (v82):** `servicos.listar/obter/salvar/remover` já existem em `backend/.../servicos/` (dono e profissional leem, só o dono escreve), com as regras acima e casos compartilhados em `equivalencia/servicos.json`. Faltam as partes que dependem de outros módulos: notificações próprias, materiais, confirmação do serviço e grupo/Pix.
> **Servidor real (v83):** `equipe.salvar/remover/definirAtendimento/minhaFoto` existem em `backend/.../equipe/UsuarioController` (`/api/usuarios`), com a senha **gerada no servidor** (`POST` e `POST /{id}/senha-temporaria` devolvem `senhaTemporaria` uma vez) em vez de digitada, perfis `dono/admin/atendente/profissional`, permissão por seção em `seguranca/Permissoes` e casos em `equivalencia/equipe.json`.

| `equipe.salvar` | `POST /usuarios`, `PUT /usuarios/{id}` | **dono** | `podeVender` boolean (padrão true; só quem pode vender é vendedor válido); papel ∈ {dono, admin, atendente, esteticista}; `permissoes` só `true`/`false` nos menus liberáveis (clientes, servicos, estabelecimento, agenda, estoque, financeiro; **relatorios nunca**); foto opcional (data URL conferida pelos bytes); CPF único; senha 4–100 (também na alteração); `comissaoPct` 0–100 ou vazio | `id`, papel e permissões nunca vêm do cliente em outro fluxo | `security` |
| `cupons.listar` | `GET /cupons` | seção **estabelecimento** | — | a **chave** só sai nesta rota; no banco, guardar cifrada (reversível, porque o dono precisa reenviar a chave) ou, se preferir só conferir, `SHA-256` com sal e mostrar a chave uma única vez na criação | `cupons` |
| `cupons.salvar` | `POST /cupons`, `PUT /cupons/{id}` | estabelecimento | nome ≤ 60; tipo ∈ {servico, percentual, valor}; vale exige 1–10 serviços; % 1–100; R$ 0,01–10000; datas `yyyy-MM-dd` com fim ≥ início; usos 1–10000; por cliente 1–100; máx. 200 cupons | **a chave é gerada no servidor** (`SecureRandom`, 12 símbolos de 32 = 60 bits, sem 0/O/1/I) e nunca vem do cliente; cupom vencido ou encerrado **não se altera** (usar como modelo) | `cupons` |
| `cupons.novaChave` | `POST /cupons/{id}/chave` | estabelecimento | — | a chave antiga deixa de valer na hora; não vale para cupom do histórico | `cupons` |
| `cupons.remover` | `DELETE /cupons/{id}` | estabelecimento | — | já usado: não apaga, **encerra** (vai para o histórico); sem uso: apaga | `cupons` |
| `agenda.aplicarCupom` | `POST /agendamentos/{id}/cupom` | agenda; esteticista só no horário dele | `chave` ≤ 40 | só `a_confirmar`/`confirmado`; um cupom por horário; vigência, limite total e por cliente (**usos = agendamentos não cancelados com o cupom**, sem contador separado: cancelar devolve o uso); cópia (`foto`) do cupom gravada no agendamento; recalcula o valor e acerta Pix pago/pendente como em qualquer mudança de valor; no painel o motivo é detalhado | `cupons` |
| `agenda.retirarCupom` | `DELETE /agendamentos/{id}/cupom` | agenda; esteticista só no dele | — | só `a_confirmar`/`confirmado` | `cupons` |
| `whatsapp.usarCupom` | `POST /whatsapp/agendamentos/{id}/cupom` | número do remetente dono do horário | `chave` ≤ 40 | **resposta única** "Cupom inválido ou indisponível" para chave inexistente, vencida, esgotada ou já usada (não revela a chave); comparação em tempo constante; **5 chaves erradas seguidas bloqueiam o número por 15 min** (contador por telefone, persistido mesmo com a operação recusada; no back-end, tabela com TTL); limite de tentativas também por IP | `cupons` |
| `equipe.minhaFoto` | `PUT /usuarios/me/foto` | logado (só a própria foto) | data URL png/jpeg/webp, até ~30 KB, conferida pelos primeiros bytes (não pelo que o cliente diz); `null` remove | foto é dado opcional do cadastro; fica fora de log; a imagem é recortada e reduzida no navegador, mas o servidor revalida tipo e tamanho | `security` |
| `equipe.remover` | `DELETE /usuarios/{id}` | dono | — | não remove a si mesmo, nem o último dono, nem quem tem histórico (desativa) | `security`, `domain` |
| `equipe.definirAtendimento` | `PUT /usuarios/{id}/atendimento` | dono | `atende` boolean | bloqueia desativar com agendamentos futuros | `domain` |
| `estabelecimento.salvar` | `PUT /estabelecimento` | `estabelecimento` | `endereco` texto até 200 (aparece na página pública); `ddds` lista de **números 11–99** sem repetir; `escala` semana válida; notificações; `logo` PNG/JPEG/WebP ≤ 100 KB com assinatura; `corTema` e `corTema2` `#rrggbb` (as duas cores dominantes da logo; saem junto com a logo); `temaCor` ∈ {padrao, logo, ambar, petroleo, vinho, grafite, oliva, azul-noite} ("logo" exige logo com cor; sem logo volta a padrao); `boxes` (1–20, nome único ≤ 30, ao menos um ativo; box com histórico só desativa, box com carro agendado não desativa); `calendario` objeto fechado; `comissaoPadrao` 0–100 (só o dono) | pixCancelamento válido | `security`, `tema`, `coerencia`; `usaIntegracaoPix` boolean (desligado bloqueia cobrança, envio, API Pix, Open Finance e sincronização); `formaPagamentoPadrao` ∈ {pix, dinheiro, cartao, ""}; `contaPorForma` {pix, dinheiro, cartao} → id de conta existente ou "" | `security` |
| `estabelecimento.salvar` (campo `tipo`) | `POST /estabelecimentos` (cria a loja, **administrador da plataforma**, F1) e `PUT /estabelecimento` | `estabelecimento` (o `PUT`) | `tipo` ∈ catálogo de tipos (`tipo_estabelecimento`: `estetica_automotiva`, `barbearia`); **só na criação**. No `PUT`, qualquer `tipo` diferente do atual é recusado (409, "O tipo do estabelecimento não pode ser alterado depois de criado.") e **nada** do corpo é gravado; o mesmo tipo é aceito e ignorado. Coluna `tipo` `NOT NULL`, sem atualização (`updatable=false`) | O tipo define as **capacidades** (`usaVeiculo`, `precoPorPorte`, `usaRecursoFisico`, `multiDia`, `prontoParaRetirada`) e os **rótulos** (`profissional`, `recurso`); `publico.config` devolve o `tipo`. Loja sem o campo é tratada como `estetica_automotiva` | `tipos` |
| `store.entrarNaLoja(slug)` / `store.reiniciar()` | **não existem no Spring** | — | Só protótipo/demonstração: troca de loja de exemplo e restaura os dados da atual. Em produção a loja vem do `Host` (`LojaFilter` + claim `loja` do JWT + `loja_id` com RLS) e o tipo é imutável; ver `docs/F1-lojas-por-dns.md` | `tenant.js` | `tests/tenant.test.mjs`, `tests/e2e32.mjs`, `tests/e2e33.mjs` |
| `GET /api/publico/loja` | novo (F1) | sem sessão | Resolve a loja pelo `Host` e devolve `{slug, nome, tipo, logo, temaCor, temaCor2}` para o React escolher tipo, tema e marca antes de desenhar. 404 se o host não é de nenhuma loja | `tenant.js` | F1 |
| Campos por capacidade (todas as escritas de agendamento, cliente e serviço) | mesmas rotas | — | Sem `usaVeiculo` a API **descarta** `veiculoId, veiculo, veiculos, placa, marca, modelo, cor, porte`; sem `usaRecursoFisico`, `boxId, boxes`; sem `precoPorPorte` o serviço guarda `preco` e `duracao` únicos; sem `prontoParaRetirada` as ações de andamento/pronto são recusadas. No Spring: Bean Validation por tipo + DTO único, a capacidade vem da tabela `tipo_estabelecimento` | `domain` | `tests/tipos.test.mjs` |
| `estabelecimento.salvarEscalaProfissional` | `PUT /usuarios/{id}/escala` | dono, admin com `agenda`, ou o próprio esteticista | semana: dias 0–6, `aberto` boolean, faixas `HH:MM` e início < fim, máx. 6 | — | `security` |
| `excecoes.impacto` | `GET /excecoes/impacto` | escopo (ver abaixo) | datas `AAAA-MM-DD`, período ≤ 1 ano | recalcula os afetados no servidor | `domain` |
| `excecoes.salvar` | `POST /excecoes` | escopo: `estab` exige `estabelecimento`; esteticista só a própria escala; dono sempre; admin com `agenda` | tipo, datas, faixas, rótulo ≤ 100 | `resolverAfetados`: **ignora ids enviados que não sejam afetados**; destino cancelar (sem mensagem) ou avisar | `security`, `domain` |
| `excecoes.remover` | `DELETE /excecoes/{id}` | idem | — | — | `security` |
| `excecoes.impactoFeriados` / `vincularFeriados` | `GET` / `PUT /estabelecimento/calendario-feriados` | `estabelecimento` | `vincular` boolean, `ids[]` | idem | `domain` |
| `modelos.salvar` | `POST /modelos`, `PUT /modelos/{id}` | `estabelecimento` | nome ≤ 100, corpo ≤ 1024, até 3 botões ≤ 25; formato Meta (sem variável no início ou fim) | **modelos do sistema nunca mudam** | `security`, `domain` |
| `modelos.remover` | `DELETE /modelos/{id}` | `estabelecimento` | — | sistema não remove | `security` |
| `estoque.salvarMaterial` / `removerMaterial` / `movimentar` | `POST/PUT/DELETE /materiais…`, `POST /materiais/{id}/movimentos` | `estoque` | `codigo` só em produto (mesmas regras do serviço, único entre produtos; material de consumo fica sem código); números finitos ≥ 0, ≤ 1e9; `tipo` ∈ {material, produto}; produto exige `preco` 0–100 mil; `comissaoPct` do produto 0–100 ou vazio (só o dono grava; 0/vazio = sem comissão) | em uso ou com movimento só desativa; tipo não troca para produto se é material de serviço, nem volta a material se já foi vendido; produto não entra em `materiais` de serviço; estoque nunca negativo | `domain`, `conflitos`; `grupoMovimentacaoId` do produto opcional (grupo existente) | `pagamento` |

## 5. Financeiro, Pix e crédito

| Método JS | Endpoint | Perm. | Regra | Testes |
|---|---|---|---|---|
| `financeiro.salvarLancamento` / `removerLancamento` | `POST/PUT/DELETE /financeiro/lancamentos…` | `financeiro` | até R$ 10 mi; conciliado só muda descrição e categoria | `domain` |
| `financeiro.conciliarGrupo` | `POST /financeiro/conciliacoes` | `financeiro` | `extratoIds` e `lancamentoIds` (1–50, sem repetir); mesma conta e sentido; receitas ↔ entradas, despesas ↔ saídas; **soma dos dois lados igual** ou erro com a diferença; cada item em um só grupo; bloqueado sem integração Pix | `pagamento` |
| `financeiro.desfazerConciliacao` | `DELETE /financeiro/conciliacoes/{id}` | `financeiro` | itens voltam a "a classificar" | `pagamento` |
| `financeiro.sugestoesConciliacao` | `GET /financeiro/conciliacoes/sugestoes?conta=` | `financeiro` | mesmo valor, até 2 dias de diferença, menor grupo | `pagamento` |
| `financeiro.salvarConta` / `removerConta` / `salvarGrupo` / `removerGrupo` | `POST/PUT/DELETE /financeiro/contas…`, `/grupos…` | `financeiro` | sempre resta 1 conta e 1 grupo; conta com movimento não sai | `domain` |
| `financeiro.salvarPix` | `PUT /financeiro/contas/{id}/pix` | `financeiro` | tipo e chave válidos | `domain` |
| `financeiro.gerarCobranca` | `POST /agendamentos/{id}/cobrancas` | `meuAgendamento` | CPF do pagador válido; **uma cobrança por conta**; valor ≤ R$ 100 mil; cobrado de agendamento cancelado é recusado | `domain`, `conflitos` |
| `financeiro.enviarCobranca` | `POST /cobrancas/{id}/enviar` | `meuAgendamento` da cobrança | envia pelo WhatsApp | `domain` |
| `financeiro.cancelarCobranca` | `DELETE /cobrancas/{id}` | `meuAgendamento` da cobrança | com API ativa cancela **no banco**; paga não cancela | `domain` |
| `financeiro.confirmarManual` | `POST /cobrancas/{id}/confirmar-pagamento` | `financeiro` | **idempotente**: um crédito por cobrança paga | `conflitos` |
| `financeiro.acertarValorPago` (e o atalho `manterComoCredito`, que é o destino `credito`) | `POST /agendamentos/{id}/valor-pago` | `meuAgendamento`; **destino `despesa` exige `financeiro`** | nunca passa do pago, não se repete (restrição única no banco); só `crédito` avisa o cliente; crédito nasce **aqui**, com `expiraEm` = 2 meses | `acerto`, `credito` |
| `financeiro.usarCredito` | `POST /agendamentos/{id}/usar-credito` | `meuAgendamento` | só crédito **da mesma conta**, não expirado; sem lançamento novo; **cancela o Pix pendente da conta** (se falhar, recusa) | `credito` |
| `financeiro.salvarApiPix` / `testarApiPix` / `desativarApiPix` | `PUT/POST/DELETE /financeiro/contas/{id}/api-pix…` | `financeiro` | segredo cifrado e **nunca volta** na resposta | `domain` |
| `financeiro.conectarOpenFinance` / `desconectarOpenFinance` / `sincronizar` | `POST/DELETE /open-finance/contas/{id}/…` | `financeiro` | consentimento 12 meses | `domain` |
| `financeiro.autorizarExtrato` / `rejeitarExtrato` / `classificarExtrato` / `ignorarExtrato` | `POST /open-finance/extrato/{id}/…` | `financeiro` | Pix com CPF ou valor diferente só confirma com autorização | `domain` |
| `bancoSimulado.pagarPix` | **webhook** `POST /webhooks/pix` | **sem login: assinatura** (mTLS ou HMAC) | consulta `GET /cob/{txid}` no banco, deduplica por `e2eid`; CPF e valor conferem ou vai para "Precisa de autorização" | `conflitos` (fuzz) |
| `demo.profissionaisExemplo` | — | **não existe em produção** | só `@Profile("dev")` | acrescenta esteticistas de exemplo e um dia cheio, só para ver a agenda com muita gente | — |
| `bancoSimulado.lancar` | — | **não existe em produção** | só `@Profile("dev")` | — |

## 6. WhatsApp (porta pública, sem usuário do painel)

Autenticação: **assinatura do webhook da Meta** (`X-Hub-Signature-256`). O número vem do canal, **nunca** do texto. Todo endpoint abaixo recebe o número do remetente já verificado e compara com `telefoneDoCanal`: aceita só `55`+DDD+8/9 dígitos. Número de 10/11 dígitos sem o 55 é de outro país (+51, +53…) e é tratado como desconhecido.

| Método JS | Endpoint | Dono do nº | Regra | Testes |
|---|---|---|---|---|
| `whatsapp.identificar` / `clientePorTelefone` | `GET /whatsapp/clientes` | sim | só acha cadastro do próprio número; CPF e nome só desempatam | `security`, `coerencia` |
| `whatsapp.dddPermitido` / `bloquearDdd` | `POST /whatsapp/bloqueio-ddd` | número válido | DDD vem do **canal**; fora da lista = mensagem de bloqueio (registro persiste) | `domain`, `coerencia` |
| `whatsapp.horariosLivres` / `profissionaisComHorario` | `GET /whatsapp/disponibilidade` | — | origem `whatsapp`: antecedência e 60 dias | `domain` |
| `whatsapp.agendar` | `POST /whatsapp/agendamentos` | sim | até 5 ativos por cliente; cliente novo só no fim; número novo + CPF existente = **pedido de vínculo** | `domain`, `security` |
| `whatsapp.confirmar` | `POST /whatsapp/agendamentos/{id}/confirmar` | sim | confirma, cancela pendentes conflitantes | `domain` |
| `whatsapp.cancelar` / `podeCancelar` | `POST …/cancelar`, `GET …/pode-cancelar` | sim | **só com 24 h ou mais, conferido na hora do clique**; exatamente 24 h vale; remarcado dentro das 24 h fica travado | `cancelar`, `coerencia` |
| `whatsapp.remarcar` | `POST …/remarcar` | sim | trava o cancelamento se faltava < 24 h | `coerencia` |
| `whatsapp.editarServicos` | `PUT …/servicos` | sim | revalida horário; volta a "a confirmar"; **plano remontado**; modelo "Serviços alterados"; bloqueado se cobrança paga com crédito | `credito`, `coerencia` |
| `whatsapp.meuCredito` | `GET /whatsapp/clientes/{id}/credito` | sim | só revisado pelo esteticista e não expirado | `credito` |
| `whatsapp.creditoUsavel` / `aPagar` / `valoresDoHorario` | `GET …/credito-usavel`, `…/a-pagar`, `…/valores` | sim | crédito da mesma conta; valores **congelados** | `credito`, `coerencia` |
| `whatsapp.usarCredito` | `POST …/usar-credito` | sim | o cliente **só gasta**; o resto é pago separadamente | `credito` |
| `whatsapp.editarMeusDados` | `PUT /whatsapp/clientes/{id}` | sim | só nome, apelido, CPF, nascimento; CPF de outro cliente recusado sem dizer de quem | `security` |
| `whatsapp.meusAgendamentos` / `remarcaveis` | `GET /whatsapp/agendamentos` | sim | resumo sem histórico interno nem CPF | `security` |

## 7. Leituras do painel (no protótipo saem do snapshot do estado)

Não existe `GET` por recurso no protótipo: a tela lê o estado inteiro. No Spring Boot, cada leitura vira um endpoint com filtro por perfil:

| Função JS | Endpoint | Regra de visibilidade |
|---|---|---|
| `agendamentosVisiveis` | `GET /agendamentos?de=&ate=&profissionalId=` | **paginado por período**; esteticista recebe só os seus (o filtro é do servidor, não da tela) |
| `profissionaisVisiveis` | `GET /esteticistas` | esteticista vê só ele |
| `avisosDoUsuario` | `GET /avisos` | esteticista só os dele; `vinculo` só quem autoriza |
| `pedidosVinculoVisiveis` | `GET /clientes/vinculos` | só quem autoriza; **CPF mascarado** |
| (estado) | `GET /clientes`, `/servicos`, `/modelos`, `/estabelecimento`, `/financeiro/*`, `/materiais`, `/relatorios/*` | por seção; DTOs sem senha e sem CPF completo; credenciais de banco nunca |
| `destinosCalendario` | job de integração | e-mail do estabelecimento e do esteticista, sem duplicar |

### 7.1 Preferências do usuário (no protótipo ficam no `localStorage`)

| No protótipo | Endpoint | Regra |
|---|---|---|
| `agenda-visao:<usuário>`, `agenda-esteticistas:<usuário>`, `ordem:<lista>:<usuário>` | `GET /usuarios/me/preferencias`, `PUT /usuarios/me/preferencias` | sempre do **próprio** usuário logado (nunca `{id}` na rota); JSON com lista branca de chaves (`visao`, `esteticistas`, `ordem.<lista>`); `ordem.*` é lista de até 40 textos de até 60 caracteres, sem repetição (mesmo saneamento de `sanearOrdem`); tamanho total limitado (ex.: 8 KB); esteticista não grava filtro de esteticistas; nada de HTML nem dado pessoal; `restaurar` = `DELETE /usuarios/me/preferencias/ordem` |

Teste: `PreferenciasIT` (um usuário não lê nem grava a preferência de outro; lista fora do limite, com repetição ou com tipo errado é recusada; chave desconhecida é recusada).

## 8. Jobs agendados (`E.tick` + `tickFinanceiro`)

Falta de confirmação (aviso no horário; cancela ao fim da duração), lembretes e pergunta de confirmação **só em horário comercial**, cancelamento do Pix pendente conforme os avisos, expiração de cobrança, expiração de **crédito** (registra no histórico), **aviso de crédito perto de vencer** (7 dias antes, uma vez por crédito, flag `avisoVencimentoEm`), conclusão automática, baixa de estoque. Cada job idempotente e protegido por `@SchedulerLock` (ShedLock) quando houver mais de uma instância.

## 9. Concorrência e integridade no banco (o que o protótipo garante só em memória)

1. **Dois confirmados no mesmo horário:** lock pessimista por esteticista e dia (`SELECT … FOR UPDATE` na agenda) ou restrição de exclusão (`EXCLUDE USING gist` com `tstzrange` no PostgreSQL) em agendamentos ativos confirmados.
2. **Um crédito por cobrança paga / um acerto por cobrança:** `UNIQUE` em `credito(cobranca_id)` e em `baixa(cobranca_id, destino)`.
3. **Pix:** `UNIQUE` em `txid` e em `e2eid` (webhook repetido não duplica).
4. **Limites de crescimento:** tamanho de campo e de lista no DTO; estado nunca vira um JSON gigante.

## 10. Proteção de dados pessoais (LGPD)

## 10b. Porta pública: autoagendamento pelo link (`publico.*`, sem login)

Rotas abertas, **sem sessão**: a identidade é um token pessoal (48 caracteres aleatórios, no banco só o hash, 90 dias, até 5 por cliente) ou telefone + código de 6 dígitos. Rate limit no gateway (por IP e por telefone) além dos contadores do domínio. Nunca devolvem dado de outro cliente nem quem ocupa um horário. Código: `domain/publico.js`; testes: `tests/publico.test.mjs`, `e2e29`.

| Protótipo | Endpoint | Perm. | Validação / regra | Testes |
|---|---|---|---|---|
| `publico.config` | `GET /publico/config` | — | só nome, telefone e endereço da loja, serviços ativos e esteticistas que atendem | `publico` |
| `publico.diasLivres` | `GET /publico/dias-livres?porte=` | — | `porte` obrigatório (preço e duração dependem dele); dias com ao menos um horário livre, até `linkAgendamento.diasMax` (1 a 60) | `publico` |
| `publico.horarios` | `GET /publico/horarios?porte=` | — | `porte` obrigatório; escolhe esteticista **e box** livres (serviço de vários dias ocupa o box até a retirada); devolve só `{ inicio, profissionalId }`; agendamento **pendente também ocupa**; passo de 30 min | `publico` |
| `publico.agendar` | `POST /publico/agendamentos` | — | veículo `{ placa, modelo, porte }` obrigatório (placa antiga ou Mercosul validada só por formato, sem consulta externa; preço e duração congelados pelo porte); nome ≥ 2 letras, telefone BR com DDD atendido, 1 a 10 serviços; campo isca (`site`) vazio; máx. 3 em aberto por cliente; 5 pedidos/min por telefone; horário revalidado dentro da transação (restrição no banco contra dois no mesmo horário); nasce `a_confirmar` com `clienteAgendou`; devolve o token | `publico` |
| `publico.pedirCodigo` | `POST /publico/acesso/codigo` | — | resposta sempre igual (cadastro existente ou não); 3 pedidos por 15 min por telefone; código por WhatsApp (modelo `codigo_acesso`) | `publico` |
| `publico.entrar` | `POST /publico/acesso` | — | 5 tentativas, 30 min, uso único; devolve o token | `publico` |
| `publico.meus` | `GET /publico/meus-agendamentos` | token | só os do dono do token (DTO `resumoPublico`) | `publico` |
| `publico.diasParaRemarcar` / `horariosParaRemarcar` | `GET …/{id}/dias-livres`, `…/horarios` | token | mesmo esteticista e serviços do agendamento; o próprio horário conta como livre | `publico` |
| `publico.remarcar` | `POST …/{id}/remarcar` | token | só o próprio; horário revalidado; pedido do link volta a "Cliente agendou" e os lembretes são recalculados | `publico` |
| `publico.cancelar` | `POST …/{id}/cancelar` | token | só o próprio; **24 h ou mais, conferido na API** | `publico`, `cancelar` |
| `publico.lembretes` | `PUT /publico/lembretes` | token | aceitar ou recusar os avisos de 24 h e 2 h (`cliente.lembretes`) | `publico` |

Configuração do dono: `estabelecimento.salvar` aceita `linkAgendamento: { ativo, diasMax }` (permissão `estabelecimento`). Lembretes: job a cada minuto (`tick`) envia `lembrete_24h` e `lembrete_2h` só se o cliente aceitou e o horário segue ativo; no real, WhatsApp (Meta) e/ou Web Push.

Mapa completo em **[MAPA-DADOS-PESSOAIS.md](MAPA-DADOS-PESSOAIS.md)**: inventário campo a campo (CPF, telefone, nascimento, senha, segredos de banco, extrato, logs), como cifrar e ainda buscar (AES-GCM por campo + hash HMAC), direitos do titular, matriz de acesso por perfil e o teste que prova cada proteção (`DadosPessoaisIT`). Resumo: CPF, telefone e nascimento cifrados por campo; senha só com BCrypt/Argon2; segredos de banco só no cofre e nunca devolvidos; logs sem CPF nem telefone inteiros (nome e apelido podem aparecer, e ficam em texto puro no banco); TLS e disco cifrado.

## 10c. Primeiro acesso do dono (`/api/onboarding/*`, só existe no real; o Artifact tem só a pré-visualização `services/onboarding-demo.js`)
| Rota | Quem | O que faz | Regras e testes (`OnboardingTest`) |
|---|---|---|---|
| `GET /api/onboarding` | dono | `{tipo, passo, concluido, servicos[catálogo do tipo], jaCadastrados[chaves]}` | sem linha em `onboarding` = 404; profissional 403; token de senha temporária 403 |
| `POST /api/onboarding/servicos` `{itens:[{chave, preco?, duracaoMin?}]}` | dono | cria serviços do catálogo **do tipo da loja**; idempotente por nome; lista vazia = pular | chave de outro tipo/desconhecida/mal formada = 400; preço 0..100000, duração 1..14400; serviço com preço por porte ignora o preço editado; passo → `equipe` (só enquanto não concluído) |
| `POST /api/onboarding/equipe` `{pessoas:[{nome, atende?}]}` (até 10) | dono | cria `profissional` com login (primeiro nome sem acento, sufixo 2, 3…) e senha temporária de 12 caracteres, `deve_trocar_senha = true`; devolve login+senha **uma vez** (`Cache-Control: no-store`) | só o hash fica salvo; **só cria, nunca exclui nem altera quem já existe**; passo → `expediente` (só enquanto não concluído) |
| `POST /api/onboarding/expediente` `{semana:{0..6:{aberto, faixas:[["09:00","12:00"]]}}}` | dono | grava o expediente da **loja** (`escala_faixa` com `usuario_id` nulo); semana vazia ou sem dia aberto = pular (nada gravado); `GET /api/onboarding` traz `expedienteSugerido` (do tipo) e `expediente` (o já gravado) | faixa `HH:MM`, início < fim, sem sobreposição, máx. 6 por dia, dias 0–6; inválido = 400; passo → `pronto` (só enquanto não concluído); resposta `{criados: 1\|0}` (`OnboardingTest`, `EscalaTest`) |
| `POST /api/onboarding/concluir` | dono | `concluido_em = now()` | repetir é inofensivo; depois disso o login não traz mais `onboardingPendente` |
| `PUT /api/usuarios/me/senha` (já existe) | dono | ao trocar a senha temporária do **dono**, o passo `senha` vira `servicos` | profissional trocando a própria senha não mexe no assistente |

O catálogo (`backend/src/main/resources/catalogo/<tipo>.json`) é gerado dos seeds (`node tools/gerar-catalogo.mjs`); `tests/catalogo.test.mjs` falha se divergir.

## 11. Pontos do protótipo que **não** existem no real (tratar como pendência)

`MODO_DEMO` (código de recuperação na resposta), `bancoSimulado`, `store.avancar`/`reiniciar`, snapshot com senhas e CPFs, sessão em variável do navegador, contadores de login na memória, chave de autoria no front. Todos substituídos pelas camadas das seções 0 a 10.

## 10d. Expediente e escala no servidor (v76, `escala/`; `EscalaTest`)
| Rota | Quem | O que faz | Regras |
|---|---|---|---|
| `GET /api/estabelecimento/escala` | dono, profissional | expediente da loja `{semana:{0..6:{aberto, faixas}}}` | dia 0 = domingo; sem expediente salvo = sem restrição |
| `PUT /api/estabelecimento/escala` | dono | grava o expediente da loja (troca inteira) | ao menos um dia aberto; faixas válidas (início < fim, sem sobrepor, máx. 6) |
| `GET /api/profissionais/{id}/escala` | dono; o próprio profissional | escala própria (vazia = segue a loja) | profissional lendo outro = 404 |
| `PUT /api/profissionais/{id}/escala` | dono; o próprio profissional | grava a escala própria; **nenhum dia aberto apaga** a escala própria (volta a seguir a loja) | profissional inexistente/inativo = 404 |
| `POST /api/agendamentos` e remarcar (`AgendaController`) | quem já tinha | recusa com 409 "O profissional não atende nesse horário (fora do expediente)." | o atendimento cabe **inteiro** numa faixa (fuso America/Sao_Paulo); serviço de vários dias só confere a entrada |

**Reconfigurar (v78):** depois de concluído, o dono pode reabrir o assistente (Estabelecimento > Reconfigurar). `POST /api/onboarding/servicos|equipe|expediente` deixam de responder 409 e passam a valer de novo, sempre **aditivos**: serviço novo entra (idempotente por nome), pessoa nova é criada (nunca se exclui ou se altera quem já existe), e o expediente enviado substitui o da loja (semana vazia = não mexe). `passo` e `concluido_em` não voltam atrás; o login segue sem `onboardingPendente`. Profissional continua 403. Teste: `OnboardingTest.concluirNaoImpedeReconfigurarMasSoAdicionaENuncaExclui`.
