# F1: a loja (tipo, dados, marca) vem do endereço usado (DNS/URL)

Status: **projeto + protótipo + esqueleto Spring com Gate 3 no CI (`backend/`)** (`src/domain/tenant.js`, `src/services/lojas-demo.js`, `tests/tenant.test.mjs`, `tests/e2e33.mjs`). O Spring Boot, o Caddy e o banco são da F1.

## Regra
Quem decide a loja é **o endereço**, nunca um campo que o navegador escreve. Da loja saem o **tipo** (imutável), os **dados**, a **marca** (logo, cores) e as **permissões**. Endereço desconhecido = "loja não encontrada"; **nunca** cai em loja padrão (em produção).

## Como o endereço escolhe a loja (ordem)
| # | Endereço | Exemplo | Uso |
|---|---|---|---|
| 1 | Domínio próprio da loja (tabela `loja_dominio`) | `agenda.apexestetica.com.br` | painel e link do cliente com a marca da loja |
| 2 | Subdomínio da plataforma (um rótulo só) | `dalforno.agendz.com.br` | padrão de toda loja nova, sem configurar nada |
| 3 | Caminho público | `agendz.com.br/agendar/dalforno` | link compartilhável no WhatsApp / bio |
| 4 | `?loja=dalforno` | `localhost:5173/?loja=dalforno` | **só demonstração e desenvolvimento** (`permitirQuery=false` em produção) |

Recusas: host com mais de um rótulo (`a.b.agendz.com.br`), host parecido (`dalforno.agendz.com.br.evil.com`), slug reservado (`www`, `api`, `admin`, `app`…), slug fora de `[a-z0-9-]{1,40}`. Maiúsculas, porta e ponto final são normalizados. O domínio próprio ganha de qualquer outra pista.

## Fluxo no sistema real
1. **DNS:** `*.agendz.com.br` aponta para a VPS (registro curinga). Domínio próprio da loja: o cliente cria um `CNAME agenda → alias.agendz.com.br`.
2. **Caddy:** certificado curinga para `*.agendz.com.br` (DNS-01) e **TLS sob demanda** para domínio próprio, com `ask` em `GET /interno/dominio-permitido?host=…` (200 só se o host está em `loja_dominio` com `verificado = true`); isso impede emitir certificado para qualquer domínio apontado para a VPS. O Caddy repassa `Host` e `X-Forwarded-Host`.
3. **Spring (filtro `LojaFilter`, primeiro da cadeia):** lê **só** o `Host` repassado pelo proxy (o proxy sobrescreve qualquer `X-Forwarded-Host` vindo de fora), roda a mesma regra de `tenant.js`, busca `loja` no banco e guarda `LojaContext(lojaId, tipo)` na requisição. Sem loja = 404 antes de qualquer rota. O contexto fica visível aos serviços; nenhum endpoint recebe `lojaId` no corpo ou na URL.
4. **JWT:** o token leva o claim `loja` (id). Se `claim.loja != LojaContext.lojaId` → 403 e log de segurança. Token de uma loja não abre outra, nem com o `Host` trocado.
5. **Banco:** toda tabela de negócio tem `loja_id NOT NULL` com FK; consultas passam por filtro do Hibernate (`@Filter` ligado ao `LojaContext`) e, como segunda trava, **Row Level Security** do PostgreSQL (`SET LOCAL app.loja_id = …` por transação; política `loja_id = current_setting('app.loja_id')::uuid`). Índices de unicidade (horário, telefone, código, cupom) incluem `loja_id`.
6. **Bootstrap do React:** antes de desenhar, `GET /api/publico/loja` (resolvida pelo `Host`) devolve `{ slug, nome, tipo, logo, temaCor, temaCor2 }`. O front escolhe o tipo (`definirTipoAtivo`), o `data-tipo` e o tema, e **carrega só a pasta do tipo** (`import('./tipos/<tipo>/…')`: definição, tema, modelos), então a barbearia não baixa o código da estética. Falha 404 = tela "Loja não encontrada".
7. **Arquivos** (logo, fotos): gravados em `/dados/lojas/{lojaId}/…`, servidos por rota que confere a loja do `Host`; nunca por caminho adivinhável global.
8. **Cache e links:** chave de cache sempre com `lojaId`; link público `…/agendar/{slug}` e `#agendar-<profissional>` continuam; token pessoal do cliente é por loja.

## Criação da loja (administrador da plataforma, F1)
`POST /plataforma/lojas { nome, slug, tipo }` → valida slug (regra acima, único), grava `tipo` (nunca muda), cria o dono e o subdomínio. Domínio próprio: `POST /plataforma/lojas/{id}/dominios` → devolve o `CNAME` a criar; `verificado` vira true quando o DNS resolve (job). Remover domínio não apaga a loja.

## Isolamento (Gate 3) como teste de aceite
Para cada rota: (a) usuário da loja A com token A pedindo id da loja B → 404 (não revela existência); (b) token A com `Host` da loja B → 403; (c) `Host` desconhecido → 404; (d) `X-Forwarded-Host` forjado de fora é ignorado; (e) arquivo da loja A pedido no host da loja B → 404; (f) RLS: consulta sem `app.loja_id` devolve zero linhas.

## O que o protótipo já faz (e o que não faz)
- Faz: `resolverLoja` (regra pura, testada com casos de ataque), registro de lojas de demonstração (`apex` estética, `dalforno` barbearia), **estado separado por loja** (trocar de loja não mistura nem apaga dados), tipo/tema/marca/ícones seguem a loja, "loja não encontrada", seletor da demonstração só quando o endereço não decide.
- Não faz: DNS/TLS reais, token por loja, banco, RLS. O Artifact roda em endereço fixo (não dá para variar `Host`), então lá vale o seletor; fora dele (`?loja=`, `dalforno.localhost`, domínio próprio) vale o endereço e o seletor some.
- Precedência no protótipo: tipo fixado no build de teste > endereço > escolha salva no seletor > padrão.

## Decisões em aberto
- Domínio da plataforma (hoje `agendz.com.br` é provisório; falta checar registro e INPI).
- Painel no mesmo host da loja (`dalforno.agendz.com.br`) ou em `app.agendz.com.br` com login que descobre a loja? **Recomendado: mesmo host** (o `Host` já define a loja; sem tela "qual é a sua loja?").
- Domínio próprio exige plano pago? (regra comercial.)

## Como ficou no backend (27/10/2026)
- Banco acessado só por `LojaJdbc.naLoja` (transação + `SET LOCAL ROLE agendz_app` + `set_config('app.loja_id', …, true)`); **sem Hibernate filter** (a segunda trava é o próprio RLS). Tabela de negócio nova: `loja_id NOT NULL` + política RLS (copie `V2`/`V4`) + teste em `IsolamentoNoBancoTest`.
- Token: `JwtService` (HS256, claim `loja`, `papel`, `nome`); `ConferirLojaDoTokenFilter` devolve 403 se a loja do token difere da do Host. Segredo em `JWT_SEGREDO` (≥ 32 caracteres, a API não sobe sem ele).
- Testes: `LojaPorEnderecoTest`, `IsolamentoEntreLojasTest`, `IsolamentoNoBancoTest`, `AutenticacaoTest`, `TenantResolverTest`.
