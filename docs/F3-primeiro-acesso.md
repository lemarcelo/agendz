# F3: primeiro acesso (onboarding) e donos de produção

## Objetivo
No primeiro login do dono: trocar a senha temporária e passar por um assistente curto, com **exemplos do tipo da loja** (estética ou barbearia) para marcar. Tudo é salvo na base; sair no meio e voltar retoma do passo em que parou.

## Donos de produção
| Loja | Tipo | Dono | Login |
|---|---|---|---|
| Offbox | barbearia | Kiko | `kiko` |
| Dalforno | barbearia | Alan | `alan` |
| Apex | estética automotiva | Davi | `davi` |

`deploy/provisionar-loja.sh <slug> "<Nome da loja>" <tipo> <login> "<Nome do dono>" [--logo-arquivo deploy/logos/<slug>.txt]` roda **na VPS** (o Marcelo executa, uma vez por loja):
1. gera a senha forte (24 caracteres, sem símbolos ambíguos) com `openssl`/`urandom`;
2. faz o hash BCrypt dentro do PostgreSQL (`pgcrypto`, `crypt(senha, gen_salt('bf', 10))`; a senha vai por stdin, nunca por argumento) — o Spring confere hashes `$2a$` normalmente;
3. cria a loja (se não existir), o dono com `deve_trocar_senha = true`, a linha de `onboarding` e a logo;
4. mostra a senha **uma única vez** no terminal; não grava em arquivo nem log. Rodar de novo com usuário existente não recria nada; `--redefinir` gera outra senha.
O Marcelo repassa a senha a cada dono pelo canal dele. Nem o Claude nem o CI veem as senhas.

## Back-end
- Migração: `usuario.deve_trocar_senha boolean not null default false`; `onboarding (loja_id pk, passo text, concluido_em timestamptz)` com RLS.
- `PUT /api/usuarios/me/senha` `{senhaAtual, nova}`: nova com 8+ caracteres e diferente da atual; zera a flag; devolve token novo. Login devolve `deveTrocarSenha` e `onboardingPendente` (só dono). Com `trocar` no token, qualquer outra rota responde 403 "Troque a senha".
- `GET /api/onboarding` (dono): `{tipo, passo, concluido, catalogo}`. O catálogo vem de recurso por tipo (`catalogo/<tipo>.json`) derivado dos seeds de `src/tipos/<tipo>/seed.js`; teste garante que não divergem.
- `POST /api/onboarding/servicos` `{itens:[{chave, preco?, duracaoMin?}]}`: só chaves do catálogo **do tipo da loja** (outro = 400; `chave` = id do serviço no seed, para não confundir com o `codigo` numérico do serviço); cria os serviços (idempotente por **nome**, sem coluna nova); serviço com preço por porte (estética) ignora o preço editado; limites de preço e duração como em `servicos`.
- `POST /api/onboarding/equipe` `{pessoas:[{nome, atende?}]}` (até 10): cria profissionais com login gerado a partir do nome (sufixo se repetir) e senha temporária; devolve login + senha **uma vez** para o dono repassar; só o hash fica salvo.
- `POST /api/onboarding/concluir`. Cada passo é opcional (pular é válido).
- Só dono; profissional = 403; outra loja = 404/403. Testes de Gate 3 para tudo.

## Front (`ui/leve/PrimeiroAcesso.jsx`)
Passos: **Senha nova → Serviços → Equipe → Expediente → Pronto** (depois: Boxes na estética, quando o back-end tiver). Cada passo mostra os exemplos do tipo já como cartões para marcar (preço e duração editáveis em linha), com "Marcar todos", "Pular" e "Continuar". Equipe pede só o nome. Nada de CPF, e-mail ou endereço aqui: isso fica para Estabelecimento. 390 px sem rolagem horizontal, tema claro/escuro por tokens, textos por `voc/rot`. `api.onboarding.*` existe na API simulada (Artifact e testes) e em `api-real.js` (site publicado). E2E novo `tests/e2eN.mjs`: dono novo → troca senha → marca serviços → adiciona equipe → conclui → os serviços aparecem na agenda; recarregar no meio retoma o passo.

## Atenção
O login real existe desde o F2 parte 1 (`dist/index-real.html`), mas o site `*.agendz.io` só passa a usá-lo quando o Marcelo cria a variável `SITE_REAL=true` no GitHub (Settings > Secrets and variables > Actions > Variables), depois de rodar `provisionar-loja.sh`. Até lá é demonstração; o Marcelo não deve entregar as senhas reais antes disso.

## Estado (27/10/2026, v75)
Feito: catálogo gerado dos seeds + teste de igualdade; `OnboardingController` (GET estado, POST servicos/equipe/concluir) e `OnboardingTest` (Gate 3); troca de senha do dono avança o passo; `ui/leve/PrimeiroAcesso.jsx` (adaptador injetado: `api-real.js` `onboarding` no site real, `services/onboarding-demo.js` no Artifact, link "Ver o assistente de primeiro acesso" na entrada, nada é gravado); `tests/e2e37.mjs`.
Decisões sem confirmação: (1) a chave do catálogo é `chave`, não `codigo`; (2) idempotência por nome do serviço; (3) a pré-visualização do Artifact não grava nada (a API simulada pede CPF e e-mail de cada pessoa, o servidor não); (4) as senhas da equipe aparecem uma vez e a pessoa troca no primeiro login; (5) o passo Boxes entra quando o back-end tiver boxes.

## v76: passo Expediente
`POST /api/onboarding/expediente` grava o expediente da loja (escala; ver `docs/MAPA-API-SPRING.md` §10d). A tela mostra os dias abertos e o horário sugerido do tipo (`expediente` em `catalogo/<tipo>.json`, gerado do seed), com abre/fecha e pausa opcional (o mesmo horário vale para todos os dias marcados; ajustar dia a dia fica para Estabelecimento). "Pular" não grava nada: sem expediente a agenda não restringe horário. Decisão sem confirmação: um único conjunto de horários para todos os dias abertos, para o assistente continuar curto.
