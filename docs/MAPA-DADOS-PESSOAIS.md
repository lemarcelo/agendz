# Mapa de proteção de dados pessoais (LGPD)

Escopo: dados de **clientes da Apex**, da **equipe** e de **pagadores de Pix**. Não há dado de saúde; o mapa trata tudo como **dado pessoal comum**, com CPF e credenciais tratados como os mais críticos. Se o sistema passar a guardar dado de saúde (por exemplo, o app da academia), esses campos viram **dado sensível** (LGPD art. 11): consentimento específico, auditoria de cada leitura e criptografia por campo obrigatória.

Decisão do proprietário: **nome e apelido ficam em texto puro** (no banco e podem aparecer em log). O que se protege é o que identifica de forma forte ou dá acesso: CPF, telefone, nascimento, senha e segredos.

Legenda de proteção: **C** = criptografia por campo (AES-GCM, chave no cofre/KMS) · **H** = coluna de hash HMAC-SHA256 com pepper para busca/igualdade · **M** = mascarar na resposta · **X** = nunca sai do servidor · **L** = nunca vai para log · **A** = acesso auditado (quem leu, quando).

## 1. Inventário: onde cada dado mora e como é protegido

| Dado | Onde (protótipo → entidade) | Classe | Proteção no back-end | Quem lê | Retenção sugerida |
|---|---|---|---|---|---|
| CPF do cliente | `clientes[].cpf` → `cliente.cpf` | pessoal crítico | **C + H** (`cpf_hash` para unicidade e busca), **M** (`***.***.***-79`) em listas, avisos e pedidos; completo só na ficha, por quem tem `clientes`; **A** | dono, admin com Clientes, esteticista (ficha do próprio atendimento) | enquanto o cadastro estiver ativo; anonimizar a pedido |
| Telefone do cliente | `clientes[].telefone`, `telefonesAnteriores[]` | pessoal | **C + H** (`telefone_hash` do número **normalizado** `55`+DDD+número, que é o que o canal entrega); **L** (log mostra só `...4020`) | dono, admin, esteticista (ficha) | idem; números antigos ficam no histórico de vínculo |
| Nome, apelido | `clientes[].nome/apelido`, `usuarios[].nome/apelido` | pessoal comum | **texto puro no banco** (decisão do proprietário: a equipe precisa ler, buscar e ordenar sem decifrar); **pode aparecer em log**; ainda assim limpo por `limparTexto` | equipe com acesso ao agendamento | idem |
| Data de nascimento | `clientes[].nascimento` | pessoal | **C** | dono, admin | idem |
| CPF do pagador do Pix | `cobrancas[].cpf` → `cobranca.cpf_pagador` | pessoal crítico | **C + H**; vai ao banco na cobrança (`PUT /cob/{txid}`), nunca ao front completo; **M** em telas | `financeiro` | prazo fiscal (5 anos) e depois anonimiza |
| Nome e telefone do atendimento local | `agendamentos[].nomeAvulso` (opcional, ≤ 60 letras) e `telefoneAvulso` (opcional, só quando o número não tem cadastro; sem CPF) | pessoal comum / crítico | nome em texto puro como o de cliente; **telefone cifrado (C + H) como o do cliente e mascarado em log**; **não** vira cliente nem entra na anonimização por cliente (apagar por prazo de retenção do agendamento) | equipe com Agenda; o esteticista vê só os próprios | `comissao` |
| Pedido de vínculo de número | `pedidosVinculo[]` (telefone novo, nome informado, CPF do cadastro) | pessoal crítico | **C** do telefone e do CPF; **M** do CPF na resposta; visível **só** a quem autoriza (dono, admin com Clientes) | idem | 90 dias depois de decidido |
| Mensagens ao cliente | `mensagensCliente[]` (texto com nome, serviços, valor; telefone) | pessoal | o texto guarda o nome em claro (como acima), mas **sem CPF**; telefone **C + H**, mascarado em log | equipe do agendamento | 12 meses |
| Histórico do agendamento (log) | `agendamentos[].log` (quem alterou o quê) | pessoal (autoria) | só ids de usuário, sem CPF; imutável | `meuAgendamento` | enquanto o agendamento existir |
| Avisos do painel | `avisosPainel[]` | pessoal | **sem CPF completo** (usar `cpfMascarado`); esteticista só os dele | por perfil | 6 meses |
| Usuário da equipe: CPF, nascimento, e-mail, telefone | `usuarios[]` | pessoal crítico | **C + H** no CPF; **C** nos demais; **M** em listas | dono; o próprio usuário vê os dele | enquanto vínculo; depois anonimiza |
| **Usuário `suporte`** | `usuario` (identificador `suporte`) | credencial da plataforma | criado pelo Admin; senha temporária mostrada uma vez, nunca guardada no painel; some da equipe da loja; nome reservado | Admin | — |
| **Placa do veículo** | `agendamento.veiculo_placa`, `cliente_veiculo` | dado do cliente final (estética) | copiada no agendamento (foto do momento); fica no banco da loja (RLS), fora de log | dono/recepção/profissional da loja | acompanha o agendamento |
| **Senha** | `usuarios[].senha` | credencial | **hash BCrypt/Argon2**, nunca cifra reversível; **X**; **L**; fora de DTO (`semUsuarioSenha`) | ninguém | troca periódica sugerida |
| Código de recuperação | `recuperacoes[].codigo` | credencial temporária | guardar só o **hash**; 30 min; uso único; **X**; **L**; sai só pelo canal | ninguém | apaga ao usar ou expirar |
| Token de sessão / JWT | sessão em variável no protótipo | credencial | assinatura forte, expiração curta, lista de revogação; cookie `HttpOnly; Secure; SameSite` se for sessão | — | expira |
| Credenciais da API Pix do banco | `contas[].apiPix`: `clientSecret`, certificado, chave privada, `appKey` | segredo | **C com chave do cofre** ou, melhor, guardado **só no cofre** (Vault/Secrets Manager) com referência no banco; **X** (a tela nunca recebe de volta); **L** | só o serviço de Pix | rotação ao trocar de banco ou a cada 12 meses |
| Dados bancários da Apex | `contas[].agencia/conta`, chave Pix | financeiro | **C** da conta e agência; **M** na tela (`***1234`) | `financeiro` | contábil (5 anos) |
| Extrato do Open Finance | `extrato[]` (descrição, nome de quem pagou, valor) | pessoal + financeiro | **C** da descrição e do nome do pagador; consentimento de 12 meses guardado e revogável | `financeiro` | 5 anos |
| Chave de assinatura do WhatsApp e do webhook Pix | configuração | segredo | variável de ambiente/cofre; **X**; **L** | — | rotação |
| Chave de autoria (marca de build) | `segredo-autoria.txt` | segredo | fora do projeto e do repositório | só o autor | — |
| Logs de API | aba "Chamadas à API" | operacional | **pode registrar nome ou apelido** (ajuda a achar o caso); **nunca** CPF nem telefone inteiros, senha, token, código de recuperação ou segredo de banco; sem corpo bruto da requisição | dono | 90 dias |

## 2. Como cifrar e ainda buscar

- **Cifra por campo:** AES-256-GCM, IV aleatório de 96 bits por valor, chave de dados (DEK) protegida por chave mestra do KMS (envelope encryption). Formato guardado: `v1:<iv>:<texto cifrado>:<tag>` para permitir rotação de chave.
- **Busca e unicidade:** campo cifrado não se consulta por igualdade. Para achar cliente pelo telefone do WhatsApp e impedir CPF duplicado, guarda-se `HMAC-SHA256(pepper, valor normalizado)` em coluna própria com índice único. O pepper fica no cofre, separado da chave de cifra.
- **Normalização antes do hash:** telefone como `55`+DDD+número (a mesma regra de `telefoneDoCanal`), CPF só com dígitos. Sem isso o mesmo número gera hashes diferentes.
- **Nunca** cifrar senha (usar hash lento) e nunca usar a mesma chave para cifrar e para assinar.

## 3. Direitos do titular e ciclo de vida

| Direito (LGPD art. 18) | Como o sistema atende |
|---|---|
| Confirmação e acesso | exportação do cadastro e dos agendamentos do cliente (`GET /clientes/{id}/exportacao`, só dono) |
| Correção | `PUT /clientes/{id}` e `PUT /whatsapp/clientes/{id}` (o próprio cliente, só do seu número) |
| Anonimização ou eliminação | `DELETE /clientes/{id}/dados` troca nome, CPF, telefone e nascimento por marcadores e mantém só o agregado financeiro (obrigação fiscal); agendamentos futuros são cancelados antes |
| Revogação de consentimento | Open Finance revogável a qualquer momento; mensagens de marketing (se existirem) com opt-out |
| Incidente | registro, aviso ao dono e prazo de comunicação à ANPD; rotação de todas as chaves |

## 4. Quem pode ver o quê (matriz de acesso)

| Perfil | CPF completo | Telefone | Credenciais de banco | Extrato | Log de acesso |
|---|---|---|---|---|---|
| Cliente (WhatsApp) | só o seu (nunca o de outro) | o seu | não | não | não |
| Esteticista | só na ficha de agendamento dele | sim, dos clientes dele | não | não | não |
| Admin | por seção (`clientes`, `financeiro`) | sim | só com `financeiro`, e **sem ver o segredo** | com `financeiro` | não |
| Dono | sim | sim | configura, **nunca lê de volta** | sim | sim |

## 5. Testes que provam cada proteção (JUnit, em `backend-esqueleto/`)

| Proteção | Teste |
|---|---|
| CPF e telefone cifrados no banco (a coluna não contém o valor); nome e apelido legíveis | `DadosPessoaisIT.cpfETelefoneCifradosNoBanco` |
| Busca por telefone e por CPF funciona pelo hash | `DadosPessoaisIT.buscaPorHash` |
| Senha só como hash; resposta nunca traz senha | `DadosPessoaisIT.senhaSoComoHash`, `AutorizacaoIT.semSegredosNasRespostas` |
| Segredo de banco nunca volta e não aparece em log | `DadosPessoaisIT.segredoDoBancoNaoVolta` |
| CPF mascarado em vínculos e avisos | `DadosPessoaisIT.cpfMascaradoNasListas`, `AutorizacaoIT.semSegredosNasRespostas` |
| Log sem CPF nem telefone inteiros (nome e apelido podem aparecer) | `DadosPessoaisIT.logSemDadosPessoais` |
| Anonimização apaga os campos pessoais e preserva o financeiro | `DadosPessoaisIT.anonimizacao` |
| Esteticista não lê CPF de cliente de outro esteticista | `DadosPessoaisIT.profissionalNaoLeCpfAlheio` |
| Rotação de chave: valor `v1` continua legível depois de trocar a chave | `DadosPessoaisIT.rotacaoDeChave` |

Preferências de tela (visão, esteticistas filtrados, ordem de menus, abas, colunas e marcadores) **não contêm dado pessoal**: só chaves fixas do código. No back-end ficam no cadastro do usuário e saem junto com a conta (direito de eliminação).

## 6. O que o protótipo ainda faz **diferente** (e some na migração)

Snapshot do estado com senhas e CPFs em texto puro no navegador; senha comparada em texto; `MODO_DEMO` devolvendo o código de recuperação; segredos de banco no estado da página; log de chamadas com mensagens de erro e ids. Nada disso vai para produção: a migração substitui o snapshot por DTOs por perfil e move os segredos para o cofre.

## Foto do esteticista (v45)
- Campo opcional `foto` do usuário: imagem PNG, JPEG ou WebP recortada em quadrado de 96 px e reduzida no navegador (até ~30 KB). O servidor revalida o tipo pelos primeiros bytes e o tamanho, e **não confia no tipo informado pelo cliente**.
- **Meu perfil (v103):** cada pessoa lê e muda os próprios nome, apelido, e-mail, telefone, nascimento e foto por `GET/PUT /api/usuarios/me` (e-mail, telefone e nascimento continuam cifrados; o corpo da resposta não traz CPF). As escolhas de aviso (som, faixa, vibração) **não são dado pessoal** e ficam só no `localStorage` do aparelho (`agendz-aviso:<loja>:<usuário>`), nunca no servidor.
- É dado pessoal (imagem do rosto): fica fora de log e de mensagens do WhatsApp; some do cadastro ao remover a foto ou o usuário; no back-end, guardar em coluna `bytea` ou em armazenamento de objetos privado, nunca em URL pública adivinhável.
- Quem altera: o próprio usuário (`PUT /usuarios/me/foto`) e o proprietário (`PUT /usuarios/{id}`).

## Cupons e vales (v46)
- A **chave do cupom** é segredo de acesso (quem a tem usa o desconto): nunca em log, em URL ou em resposta a quem não tem o menu Estabelecimento; ao cliente só vai a chave que ele próprio recebeu. Guardar cifrada ou como hash (ver `cupons.listar` no mapa da API).
- No servidor real (v96) a chave fica em texto em `cupom.chave` (o proprietário precisa vê-la); só a seção Estabelecimento a lê. Tentativas erradas ficam em `cupom_tentativa` ligadas ao id do usuário logado (nunca à chave digitada).
- O agendamento guarda só uma **cópia do que o cupom valia** (nome, tipo, serviços, % ou R$), nunca a chave.
- Tentativas erradas de chave ficam por telefone (`cuponsTentativas`) com validade curta; é dado pessoal (telefone): apagar após o bloqueio expirar.
- A **cor** de cada pessoa da equipe (`cor`, número de 0 a 35) não é dado pessoal sensível.

## Link do cliente no servidor (v97)
- Quem agenda pelo link informa **nome e telefone**: o telefone é cifrado como qualquer outro (`telefone_cif` + `telefone_hash`) e o cadastro nasce com `origem_cadastro = 'link'`. Se o número já tem cadastro, **nada do cadastro é alterado** pelo link.
- O **token de acesso** a um horário (48 caracteres) é segredo de acesso: no banco só o SHA-256 (`acesso_publico.token_hash`), 90 dias, apagado junto com o agendamento; nunca em URL, log nem resposta que não seja a do próprio pedido. No aparelho do cliente fica em `localStorage` (por loja).
- **Avisos do painel** (`aviso_painel`, v98): texto curto com o **nome** do cliente (texto puro, como o cadastro), nunca telefone, CPF ou nascimento; visível à equipe com acesso à agenda (profissional só os do próprio horário); apagado junto com o agendamento.
- As respostas públicas nunca trazem telefone, CPF, id de cliente nem quem ocupa os outros horários. O IP de quem pede entra só no limite de uso e na tentativa de cupom (`cupom_tentativa.quem = link:<IP>`), em memória e na tabela de tentativas; some com a limpeza das tentativas.

## Implementado no servidor real (v81)
- `cliente`: `telefone_cif`/`telefone_hash`, `cpf_cif`/`cpf_hash`, `nascimento_cif` (AES-256-GCM `v1:iv:texto:tag`; hash HMAC-SHA256 com pepper e id da loja). Nome e apelido em texto puro. `cliente_telefone_anterior` guarda o número antigo cifrado e quem trocou. Chave e pepper: `CIFRA_CHAVE` e `CIFRA_PEPPER` no `.env` da VPS (gerados por `deploy/preparar-api.sh`); sem eles a API não sobe. **Perder a chave = perder os dados cifrados**: copie para fora da VPS e fora do backup do banco.
- Lista: CPF só mascarado, sem nascimento. Ficha: CPF completo e nascimento só para dono, profissional que atende o cliente ou cadastro sem horários. Nenhum log da API grava telefone ou CPF. Testes: `ClientesTest.cpfTelefoneENascimentoFicamCifradosNoBancoENomeEmTextoPuro` e vizinhos.
