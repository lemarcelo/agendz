# agendz-api (Spring Boot 3 / Java 21 / PostgreSQL 16)

Esqueleto F1: **a loja vem do endereço** (`docs/F1-lojas-por-dns.md`).

| Peça | Onde |
|---|---|
| Regra do endereço (espelho de `src/domain/tenant.js`) | `tenant/TenantResolver` |
| Filtro que lê o `Host` e fixa a loja | `tenant/LojaFilter` (404 sem loja) |
| `GET /api/publico/loja` | `publico/LojaPublicaController` |
| Pergunta do Caddy (`ask`) | `interno/DominioPermitidoController` (`/interno/dominio-permitido?domain=`) |
| Tabelas e RLS | `src/main/resources/db/migration` (V1 lojas, V2 cliente com RLS) |
| Lojas só de dev/teste | `db/seed-dev` (perfis `dev` e `test`) |

## Rodar os testes
`mvn -B verify` (precisa de Docker: Testcontainers sobe o PostgreSQL 16). O CI do GitHub faz isso a cada push.

## Regras
- Nenhum endpoint recebe `lojaId` do cliente. `X-Forwarded-Host` é ignorado (`forward-headers-strategy: none`).
- Tabela de negócio nova: `loja_id NOT NULL` + RLS (copie `V2`) + teste em `banco/IsolamentoNoBancoTest`.
- O app de produção deve conectar com um usuário **membro** de `agendz_app` (não dono nem superusuário) e fazer `SET LOCAL app.loja_id` por transação; senão o RLS não vale.
- `/interno/**` não pode ser publicado pelo Caddy.
