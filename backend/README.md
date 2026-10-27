# agendz-api (Spring Boot 3 / Java 21 / PostgreSQL 16)

Esqueleto F1: **a loja vem do endereço** (`docs/F1-lojas-por-dns.md`).

| Peça | Onde |
|---|---|
| Regra do endereço (espelho de `src/domain/tenant.js`) | `tenant/TenantResolver` |
| Filtro que lê o `Host` e fixa a loja | `tenant/LojaFilter` (404 sem loja) |
| `GET /api/publico/loja` | `publico/LojaPublicaController` |
| Pergunta do Caddy (`ask`) | `interno/DominioPermitidoController` (`/interno/dominio-permitido?domain=`) |
| Login, JWT e segurança | `auth/`, `seguranca/` (token com claim `loja`; 403 se for de outra loja) |
| Clientes | `clientes/ClienteController` |
| Serviços (dono escreve; profissional lê só os ativos; remover = desativar) | `servicos/ServicoController` |
| Profissionais / equipe (dono cria e desativa; sem login e senha na lista) | `equipe/ProfissionalController` |
| Primeiro acesso: senha temporária (token só troca a senha), `PUT /api/usuarios/me/senha`, aviso do assistente | `auth/SenhaController`, `auth/SessaoService`, `seguranca/TrocarSenhaFilter` |
| Agenda: conflito por profissional, encaixe, intervalo, remarcar, status (profissional só a própria; travada por `for update` no profissional) | `agenda/AgendaController` |
| Acesso ao banco com RLS | `tenant/LojaJdbc` (única porta para tabelas de negócio) |
| Tabelas e RLS | `src/main/resources/db/migration` (V1 lojas, V2 cliente, V4 usuário, V5 serviço, V6 atende, V7 agendamento, V8 primeiro acesso; todas com RLS) |
| Lojas só de dev/teste | `db/seed-dev` (perfis `dev` e `test`) |

## Rodar os testes
`mvn -B verify` (precisa de Docker: Testcontainers sobe o PostgreSQL 16). O CI do GitHub faz isso a cada push.

## Regras
- Nenhum endpoint recebe `lojaId` do cliente. `X-Forwarded-Host` é ignorado (`forward-headers-strategy: none`).
- Tabela de negócio nova: `loja_id NOT NULL` + RLS (copie `V2`) + teste em `banco/IsolamentoNoBancoTest`. Chave estrangeira entre tabelas de negócio é **composta** `(loja_id, id)` (a FK não enxerga o RLS; veja `V7`).
- Corpo com campo desconhecido = 400 (`fail-on-unknown-properties`); texto de pessoa passa por `validacao/Texto.limpar`; o papel nunca vem do corpo.
- Agenda ainda sem: escala/expediente, box, serviço de vários dias, preço por porte, plano de mensagens, cupom, Pix (ficam para as próximas fatias).
- O app de produção deve conectar com um usuário **membro** de `agendz_app` (não dono nem superusuário) e fazer `SET LOCAL app.loja_id` por transação; senão o RLS não vale.
- `/interno/**` não pode ser publicado pelo Caddy.
