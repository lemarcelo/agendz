# F2: front na API real (parte 1 pronta em 27/10/2026)

**Situação (27/10/2026):** o back-end tem login, clientes, serviços, profissionais e agenda núcleo (CI verde). O front inteiro ainda fala com `src/services/api.js`, uma API **síncrona** que guarda o estado todo em memória e roda o motor de regras (`domain/engine.js`) no navegador.

## Por que não liguei sozinho
1. **Regra 9 do projeto:** o Artifact é um HTML sem rede, e `tests/estatico.test.mjs` proíbe `fetch(` em `src/`. Um cliente HTTP quebra essa regra no Artifact.
2. **Tamanho da mudança:** as telas leem `store.getSnapshot()` (estado completo) e chamam funções síncronas. Com a API real tudo vira assíncrono, com carregamento e erro, e o motor de regras (conflito, comissão, cupom, Pix, mensagens) precisa ir inteiro para o servidor antes de a tela depender dele. Ligar só uma parte deixaria dois "donos" do mesmo dado.

## Proposta (a confirmar)
- **Dois builds, mesma interface.** Artifact e testes continuam na API simulada (sem rede). O site publicado (`AGENDZ_DOMINIO`) usa `src/services/api-real.js`, escolhido por `define`/alias do esbuild; o arquivo com `fetch` só entra nesse build. O teste estático passa a conferir que o `dist/agenda.html` (Artifact) não tem `fetch`.
- **Migração por partes, na ordem:** `auth` (login real, token só em memória) → `clientes` → `servicos` → `equipe` → `agenda` (conflito já está no servidor). Cada parte só troca quando o servidor tem **toda** a regra daquele recurso e o teste de equivalência (simulada × real) passa.
- **Bootstrap:** `GET /api/publico/loja` (tipo, nome, logo) → carrega só a pasta do tipo.
- Enquanto isso o site em `*.agendz.io` continua sendo a demonstração (dados de exemplo no navegador).

## Parte 1 (feita): login real e bootstrap da loja
- `AGENDZ_API=real node build.mjs` (ou `node build.mjs --real`; o `npm run build` faz os dois) gera `dist/index-real.html` a partir de `src/main-real.jsx` → `src/ui/real/AppReal.jsx` → `src/services/api-real.js`. É o **único** arquivo de `src/` com `fetch`; o bundle do Artifact (`main.jsx`) não o importa (`tests/estatico.test.mjs` monta o bundle e confere que não há `fetch(` nem rota da API real).
- Fluxo: `GET /api/publico/loja` (tipo, nome, logo, tema; 404 = "Loja não encontrada", nunca loja padrão) → login (`POST /api/auth/login`) → se `deveTrocarSenha`, tela de troca (`PUT /api/usuarios/me/senha`) → painel inicial. O painel é provisório: os módulos entram nas partes seguintes.
- Token **só em memória** (sem localStorage, sessionStorage ou cookie; `credentials: 'omit'`); recarregar a página pede o login. 401 com token = sessão vencida (volta ao login). Nenhuma função lança: devolve `{ ok, erro }` com mensagem em português; mensagem do servidor só entra no formato `{mensagem}` com até 200 caracteres.
- Testes: `tests/api-real.test.mjs` (servidor falso), `tests/estatico.test.mjs`, `tests/e2e36.mjs` (navegador, servidor falso no mesmo endereço, 390 px com fonte larga).
- **Publicação:** o CI (`ci.yml`, job do site) publica a **demonstração** enquanto a variável do repositório `SITE_REAL` não for `true`. Com `SITE_REAL=true` o `index.html` do site passa a ser `dist/index-real.html`. Ligue **depois** de rodar `deploy/provisionar-loja.sh` das lojas (antes disso o site real não tem usuário para entrar). `deploy/montar-site.sh dominio --real` faz o mesmo à mão.
- Próximas partes: clientes → serviços → equipe → agenda (cada uma só com a regra inteira no servidor e teste de equivalência).

## O que preciso de você (histórico: confirmado em 27/10)
Confirmar: (1) o Artifact fica simulado e sem rede; (2) o site publicado vira real por partes, na ordem acima. Se concordar, começo por `auth` + bootstrap.
