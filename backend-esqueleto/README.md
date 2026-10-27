# Esqueleto de testes de integração (Spring Boot)

Estes testes descrevem o comportamento que o back-end precisa ter, na ordem das regras do protótipo. Eles chamam o servidor **como o navegador chama**: requisições HTTP com o corpo adulterado, sem token, com outro número de WhatsApp, repetidas, ao mesmo tempo.

**Estado:** esqueleto **não compilado** (o ambiente onde foi escrito não alcança o Maven Central). Os testes assumem endpoints, tabelas e colunas descritos em `../docs/MAPA-API-SPRING.md`; onde o nome é hipótese há um `TODO` ou comentário. Os pontos que precisam de decisão do back-end real estão marcados com `TODO`.

## Como rodar
```
cd backend-esqueleto
mvn verify          # precisa de Docker (Testcontainers sobe o PostgreSQL)
```
Os `*IT` rodam no `verify` (Failsafe). Perfil `test` em `src/test/resources/application-test.yml`.

## O que o código de produção precisa oferecer para estes testes compilarem
1. Endpoints do mapa (`../docs/MAPA-API-SPRING.md`) e `POST /auth/login` devolvendo `{"token": "..."}`.
2. Seed de teste igual a `src/services/seed.js` (u-davi dono, u-pablo e u-marcelo esteticistas, c-marcelo/c-igor/c-jon, s-lav-detalhada/s-lav-motor/s-higien-interna/s-lav-simples, senha `1234`), carregado no perfil `test` (`db/seed-test`).
3. `Clock` injetado em todo lugar que usa data e hora (os testes trocam por `RelogioDeTeste`).
4. Porta do WhatsApp: cabeçalhos `X-Hub-Signature-256` (HMAC do corpo) e `X-Remetente-WhatsApp` (número do canal). Webhook do Pix: `X-Assinatura-Pix`.
5. Respostas de erro: 400 validação, 401 sem login, 403 sem permissão, 404 não é seu, 409 conflito de horário, 422 regra de negócio, 429 bloqueio ou excesso de pedidos, 413 corpo grande; campo `mensagem` em português.

## Mapa teste → regra do protótipo
| Classe | Espelha (Node) | Garante |
|---|---|---|
| `AuthSecurityIT` | `security`, `coerencia` | bloqueio de login, CPF normalizado, recuperação e teto de pedidos |
| `AutorizacaoIT` | `security` | permissão por seção, esteticista só o próprio, IDOR, mass assignment |
| `PreferenciasIT` | `ordem` | preferência (visão, esteticistas, ordem de menus, abas, colunas e marcadores) só do próprio usuário; ordem mal formada é recusada |
| `AgendaConflitoIT` | `conflitos`, `domain` | dois confirmados no mesmo horário sob concorrência, restrição no banco |
| `WhatsAppSeguroIT` | `cancelar`, `security`, `coerencia` | assinatura, dono do número, remetente estrangeiro, 24 h, remarcar+cancelar |
| `CreditoIT` | `credito`, `acerto` | crédito só após revisão, validade, mesma conta, uso e devolução |
| `PixWebhookIT` | `conflitos` | assinatura, idempotência por e2eid, divergência exige autorização |
| `EntradaMaliciosaIT` | `security`, `coerencia` | números como texto, DDD, logo, XSS, zalgo, corpo gigante |
| `DadosPessoaisIT` | — | cifra de CPF/telefone/nascimento, hash para busca, senha, logs, anonimização |
