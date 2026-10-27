---
name: agendz-backend-e-integracoes
description: Use ao migrar o Agendz para React + Spring Boot (F1+), implementar loja por DNS/Host, multi-tenant, Pix/banco e WhatsApp (formato Meta).
---

# Backend (Spring Boot), loja por DNS e integrações do Agendz

Protótipo: `src/services/api.js` (cada método traz o endpoint em comentário), regras em `src/domain` sem depender da tela. Mapas prontos: `docs/MAPA-API-SPRING.md` (seção 10b = porta pública), `docs/MAPA-DADOS-PESSOAIS.md` (LGPD), `docs/F1-lojas-por-dns.md` (loja por endereço), `docs/F0-tipos-de-estabelecimento.md`, `backend-esqueleto/` (JUnit). Alvo: Java 21, Spring Boot 3, PostgreSQL, Flyway, JWT, Docker + Caddy numa VPS Hostinger KVM 2.

## Protótipo → Spring
| Protótipo | Spring Boot |
|---|---|
| `mutate(fn, meta)` | serviço `@Transactional`; erro de regra = exceção de negócio com rollback e mensagem em português |
| `E.tick` e ganchos | `@Scheduled` (1 min) + após cada operação: falta de confirmação, avisos, Pix pendente, lembretes 24 h/2 h, prazo de retirada |
| `src/domain/*.js` | serviços de domínio puros, mesma nomenclatura |
| `auth.*`, `exigir`, `pode` | Spring Security + `@PreAuthorize`; profissional só vê o que é dele |
| `pegar/finito/limparTexto` | DTOs com Bean Validation; nunca expor entidade JPA |
| `whatsapp.*`, `bancoSimulado.*`, `publico.*` | webhooks com assinatura; rotas públicas com token/código e rate limit |
| `tipos.js` + `src/tipos/<tipo>/definicao.js` | tabela `tipo_estabelecimento` + Flyway com carga por tipo; capacidades guiam a validação |
| `tenant.js` `resolverLoja` | `LojaFilter` (primeiro da cadeia) lê **só** o `Host` repassado pelo Caddy |
| `seed.js`, `lojas-demo.js` | Flyway só no perfil `dev` |

## Multi-tenant (resumo; detalhes em docs/F1-lojas-por-dns.md)
- Loja vem do endereço: domínio próprio (`loja_dominio`, verificado) > subdomínio `{slug}.agendz.com.br` (um rótulo) > `/agendar/{slug}`; `?loja=` só demo. Sem loja = 404 antes de qualquer rota. Endpoint nenhum recebe `lojaId` no corpo ou na URL.
- JWT com claim `loja`; diferente do `LojaContext` = 403 + log. Toda tabela de negócio tem `loja_id NOT NULL` + filtro Hibernate + **RLS** (`SET LOCAL app.loja_id`); índices de unicidade incluem `loja_id`. Arquivos em `/dados/lojas/{lojaId}/…`; cache com `lojaId` na chave.
- Caddy: TLS curinga `*.agendz.com.br` (DNS-01) e sob demanda para domínio próprio com `ask` → `/interno/dominio-permitido`. React: `GET /api/publico/loja` define tipo, tema e marca antes de desenhar; carrega só o código do tipo.
- Criação de loja (admin da plataforma): `POST /plataforma/lojas {nome, slug, tipo}`; `tipo` nunca muda.

## Regras que não podem se perder
- **Conflito:** restrição no banco (exclusão por intervalo, `EXCLUDE USING gist`) para dois confirmados no mesmo recurso sob concorrência (profissional e, na estética, box); quem confirma primeiro fica.
- **Preço/duração** (por porte na estética, no serviço na barbearia) congelados no agendamento.
- **Pix:** um crédito por cobrança paga (idempotência em `txid`/`e2eid`); acerto nunca passa do pago nem se repete; despesa exige Financeiro; só crédito avisa o cliente.
- **Login:** BCrypt/Argon2, 5 erros/15 min (usuário e IP); rotas públicas: token de 48 caracteres (hash no banco, 90 dias), telefone + código 5 tentativas/30 min; cancelamento do cliente ≥ 24 h.
- CPF, telefone e nascimento cifrados (AES-GCM + HMAC para busca); segredos em cofre.

## Ordem
1. Esqueleto + banco + migrações (lojas, tipos, domínios) + segurança + `LojaFilter`. 2. Domínio da agenda com os testes de `tests/*.test.mjs` convertidos para JUnit (mesmos casos e nomes). 3. Endpoints (agenda, cadastros) e `api.js` trocado por HTTP mantendo assinaturas. 4. Notificações, WhatsApp, rotas públicas e jobs. 5. Estoque, relatórios, financeiro e Pix real (homologação primeiro). 6. Gate 3 como integração + fuzz de conflitos; e2e Playwright contra o front real, nos dois tipos.
Um endpoint por vez; atualize o mapa, o prompt e o histórico a cada etapa.

## Pix e BR Code (simulado no protótipo; seja honesto: adaptador real só com credenciais e homologação)
- Contas (`financeiro.contas[]`) e grupos de movimentação; um Pix por conta envolvida; valor da cobrança = preço congelado (+ produtos − cupom). Recebíveis, créditos (`creditos[]`), baixas (`baixas[]`).
- BR Code EMV TLV com CRC16-CCITT; estático e dinâmico (`txid` 26–35 caracteres, prefixo do tenant). Estados: pendente, paga, expirada, cancelada (nunca vira paga). Pagamento a menor não quita; mesmo `txid` duas vezes = um crédito.
- **O sistema não devolve dinheiro** e **nunca envia cobrança sozinho**: cancelou com Pix pago → aviso ao painel (manter como crédito, lançar despesa ou devolvido por fora).
- Adaptador de banco: contrato `ClientePix` (criar, consultar, cancelar, webhook), OAuth2 + mTLS, erros em português, homologação antes de ativar, ativação por conta, segredos só no servidor.

## WhatsApp (formato Meta)
- Modelos: variáveis `{{1}}`, `{{2}}` em sequência, sem variável no início ou fim; corpo ≤ 1024; até 3 botões de ≤ 25; categoria Utilidade/Marketing/Autenticação; `pt_BR` (`validarModelo`). Modelo novo precisa de aprovação da Meta. Textos por tipo em `src/tipos/<tipo>/templates.js`.
- Telefones chegam como `5511988887777`: `telefoneNacional` antes do DDD. Robô por opções numeradas (menu → [veículo só se `usaVeiculo`] → categoria → serviços → dia → hora → profissional → cadastro → resumo). Porta pública confere o número do remetente.
