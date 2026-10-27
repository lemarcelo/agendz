# F2: front na API real (decisão pendente do Marcelo)

**Situação (27/10/2026):** o back-end tem login, clientes, serviços, profissionais e agenda núcleo (CI verde). O front inteiro ainda fala com `src/services/api.js`, uma API **síncrona** que guarda o estado todo em memória e roda o motor de regras (`domain/engine.js`) no navegador.

## Por que não liguei sozinho
1. **Regra 9 do projeto:** o Artifact é um HTML sem rede, e `tests/estatico.test.mjs` proíbe `fetch(` em `src/`. Um cliente HTTP quebra essa regra no Artifact.
2. **Tamanho da mudança:** as telas leem `store.getSnapshot()` (estado completo) e chamam funções síncronas. Com a API real tudo vira assíncrono, com carregamento e erro, e o motor de regras (conflito, comissão, cupom, Pix, mensagens) precisa ir inteiro para o servidor antes de a tela depender dele. Ligar só uma parte deixaria dois "donos" do mesmo dado.

## Proposta (a confirmar)
- **Dois builds, mesma interface.** Artifact e testes continuam na API simulada (sem rede). O site publicado (`AGENDZ_DOMINIO`) usa `src/services/api-real.js`, escolhido por `define`/alias do esbuild; o arquivo com `fetch` só entra nesse build. O teste estático passa a conferir que o `dist/agenda.html` (Artifact) não tem `fetch`.
- **Migração por partes, na ordem:** `auth` (login real, token só em memória) → `clientes` → `servicos` → `equipe` → `agenda` (conflito já está no servidor). Cada parte só troca quando o servidor tem **toda** a regra daquele recurso e o teste de equivalência (simulada × real) passa.
- **Bootstrap:** `GET /api/publico/loja` (tipo, nome, logo) → carrega só a pasta do tipo.
- Enquanto isso o site em `*.agendz.io` continua sendo a demonstração (dados de exemplo no navegador).

## O que preciso de você
Confirmar: (1) o Artifact fica simulado e sem rede; (2) o site publicado vira real por partes, na ordem acima. Se concordar, começo por `auth` + bootstrap.
