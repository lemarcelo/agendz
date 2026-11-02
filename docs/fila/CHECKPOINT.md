# CHECKPOINT - Agendz (fila de trabalho)

- **Data/Hora:** 2026-11-02 11:13 (America/Sao_Paulo)
- **Modelo que atualizou:** Antigravity (Gemini 4 Argon) + Invoke-AiPipeline (Codex Review)
- **Branch ativa:** `feat/fila`
- **Tarefa atual:** Tarefa 2 concluida (B10 parte B / B4 - reCAPTCHA, v139)

## O que ja foi concluido
- **Tarefa 1 (B11 - v138):** Concluida e comitada em `4848f65`.
- **Tarefa 2 (B10 parte B / B4 - v139) - Todos os passos (1 a 7) concluidos:**
  - Passo 1 e 5: `src/services/api-real.js` (`comProva`) e `tests/api-real-publico.test.mjs` (**15/15 testes verdes**).
  - Passo 2: `src/ui/real/AppReal.jsx` (`Login` com `useCaptcha(loja.captchaChave)`).
  - Passo 3: `src/ui/real/AgendarPublico.jsx` (`useCaptcha` em `Agendar` e `Meus` com `pendenteMeus`).
  - Passo 4: `src/ui/real/LinkAgendamento.jsx` (`['captcha', 'verificação não resolvida']` em `link-barrados`).
  - Passo 6: `tests/e2e117.mjs` criado e **12/12 cenarios verdes** (390 px fonte larga e 1280 px x claro/escuro).
  - Passo 7: Documentacao atualizada (`CLAUDE.md` v139, `docs/DECISOES-E-DUVIDAS.md`, `docs/MAPA-API-SPRING.md`, `docs/BACKLOG-FUTURO.md`, `docs/AGUARDA-CONFIRMACAO.md`).

## PROXIMO PASSO (Ritual de entrega da secao 5 / Tarefa 3: B9a)
1. Seguir o ritual de entrega da secao 5 (promover `feat/fila` para `main` e acompanhar CI/Deploy/Fumaca) ou iniciar conferencia da Tarefa 3 (**B9a** — conferir o que ja existe em `POST /api/onboarding/link`, V41, v131).
2. Aviso obrigatorio para o Marcelo sobre a ativacao do reCAPTCHA na VPS (`RECAPTCHA_CHAVE_SITE` e `RECAPTCHA_SEGREDO` em `/opt/agendz/.env`).
