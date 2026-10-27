# Prompt de continuação do Claude (Agendz)

Cole no início de uma sessão nova, ou diga "siga o `docs/PROMPT-CONTINUACAO.md`".

---
Você trabalha no Agendz (repositório `lemarcelo/agendz`, pasta `agendz`). Leia antes: `CLAUDE.md`, `docs/ESTADO-DO-PROJETO.md`, `docs/CHECKLIST-MARCELO.md` (o que o Marcelo já fez), `docs/PENDENTE-MARCELO.md` (se existir) e `docs/F3-primeiro-acesso.md`.

## Contrato de autonomia
- Trabalhe a fila inteira, em ordem, **sem parar para perguntar e sem mensagens de progresso**. O widget de tarefas mostra o andamento. Só escreva ao Marcelo no fim (relato) ou se travar de verdade.
- Dúvida de bom senso: decida, registre no histórico dos docs e siga. Os itens de "Decisões já tomadas" abaixo **não se perguntam de novo**.
- Item que depende do Marcelo (conta, segredo, DNS, senha, dado real, dinheiro): adiante tudo que não depende dele, **anote em `docs/PENDENTE-MARCELO.md`** (o quê, por quê, comando pronto) e passe ao próximo item. Nunca espere.
- Pare e pergunte **só** se: a decisão é irreversível ou custa dinheiro; exige mudar regra fixa do `CLAUDE.md`; ou a fila acabou e tudo que resta está bloqueado.
- Ao terminar um item: testes → CI verde → docs → commit e push → próximo. Se o CI falhar, corrija e repita até ficar verde (anotações: `tools/anotar-falha-maven.sh`).

## Decisões já tomadas (não perguntar)
- Artifact continua **simulado e sem rede**; o site publicado (`*.agendz.io`) vira API real por partes (`docs/F2-front-na-api-real.md`): auth + bootstrap primeiro.
- Donos de produção: **Kiko** (Offbox, login `kiko`), **Alan** (Dalforno, `alan`), **Davi** (Apex, `davi`). Senha forte gerada **no servidor**, troca obrigatória no primeiro login, nova senha com 8+ caracteres.
- Primeiro acesso (onboarding): especificação em `docs/F3-primeiro-acesso.md`. Passos puláveis e retomáveis; só pergunta o que faz sentido para o tipo.
- Domínio e INPI: o Marcelo decide depois de domingo (1/11). Não mexa.
- Token do R2: segue o atual até antes do primeiro cliente real.
- Deploy do site é automático (ativo). Deploy da API só depois que o Marcelo ligar `DEPLOY_API`.
- Remover serviço/profissional = desativar. Texto de tela usa `rot/voc` (nunca "esteticista" fixo). Toda tabela nova: `loja_id` + RLS + FK composta + teste de isolamento.

## Fila (nesta ordem)
1. **Base de produção para o primeiro acesso:** migração (`usuario.deve_trocar_senha`, tabela `onboarding` com RLS), `PUT /api/usuarios/me/senha`, claim `trocar` no JWT (enquanto verdadeira, a API só aceita trocar a senha), `deploy/provisionar-loja.sh` (cria loja + dono com senha forte gerada na VPS, mostrada **uma vez**, nunca em arquivo/log/CI) e as logos de produção em `deploy/logos/` (geradas das constantes do front, com teste de igualdade).
2. **Teste no servidor real:** job `smoke-producao` no `deploy-api.yml`, depois do deploy, só com endpoints públicos (sem credencial): `GET /api/publico/loja` de cada loja devolve tipo e nome certos; `/api/clientes` sem token = 401; `/interno/*` de fora = 404; `X-Forwarded-Host` forjado ignorado; login errado = 401; o site responde 200. Falha do smoke deixa o CI vermelho.
3. **F2 parte 1:** dois builds (simulado sem rede para Artifact/testes; real para o site publicado), `src/services/api-real.js` com cliente HTTP (token só em memória), login real e `GET /api/publico/loja`. O teste estático passa a vigiar que `dist/agenda.html` não tem `fetch`.
4. **Primeiro acesso:** endpoints de onboarding + catálogo por tipo (derivado dos seeds, com teste de igualdade) + tela `ui/PrimeiroAcesso.jsx` + `api.onboarding` simulada + e2e. Detalhes em `docs/F3-primeiro-acesso.md`.
5. `POST /plataforma/lojas` (criar loja pela API) e verificação de domínio próprio por DNS. Base pronta: `deploy/nova-loja.sh` + TLS sob demanda no Caddy (`docs/F4-nova-loja-por-subdominio.md`).
6. Estabelecimento (configuração), escala/expediente e exceções; a agenda valida "o profissional atende nesse horário"; passo "Expediente" entra no primeiro acesso.
7. Estética: box, veículo e porte, serviço de vários dias (passo "Boxes" no primeiro acesso).
8. Tick automático (`@Scheduled` + `Clock`), plano de mensagens, status manual.
9. Cupom, estoque/material, comissão (`docs/MAPA-API-SPRING.md`).
10. Financeiro e Pix, WhatsApp (formato Meta): interface + simulador; provedor real só quando o Marcelo escolher.
11. F2 partes seguintes (clientes, serviços, equipe, agenda no front real), cada uma só quando o servidor tem **toda** a regra daquele recurso e o teste de equivalência passa.
12. Gate 3 (e): arquivos por loja, quando existir upload.

## Segredos e senhas (inegociável)
Nunca escreva senha, token ou chave em chat, arquivo, commit, log ou saída do CI. Senha de usuário real nasce no servidor e só o Marcelo a vê, uma vez. O que o CI usa de produção são só endpoints públicos.

## Pronto significa
Teste novo que falha sem a correção; teste de isolamento entre lojas (Gate 3) em todo recurso novo; `npm run verificar` quando mexer no front; CI verde; `MAPA-API-SPRING.md`, `ESTADO-DO-PROJETO.md` e `prompt-agendz-regras.md` atualizados; commit e push com a atribuição; Artifact republicado se o front mudou.

## Limites do ambiente
Sem SSH de saída (não toco na VPS; "testar no servidor real" = job do CI com endpoints públicos). Sem Maven Central nem Docker aqui: o CI compila e testa o back-end (acompanhe com `gh api repos/lemarcelo/agendz/actions/runs/...`). Para SQL, use um PostgreSQL 16 local descartável.

## Relato final (≤ 10 linhas)
Feito · decisões tomadas sem confirmação · o que depende do Marcelo (com o comando pronto, vindo de `PENDENTE-MARCELO.md`) · próximo passo.
