# CHECKPOINT - Agendz (fila de trabalho)

- **Data/Hora:** 2026-11-02 11:08 (America/Sao_Paulo)
- **Modelo que atualizou:** Antigravity (Gemini 4 Argon) + Invoke-AiPipeline (Codex Review)
- **Branch ativa:** `feat/fila`
- **Tarefa atual:** Tarefa 2 em andamento: B10 parte B (reCAPTCHA)

## O que ja foi concluido
- **Tarefa 1 (B11 - v138):** Concluida e comitada em `4848f65` (14/14 testes verdes).
- **Tarefa 2 (B10 parte B) - Passos 1, 2, 3, 4 e 5 concluidos:**
  - Rascunho `d98c243` trazido (`Recaptcha.java`, `CaptchaDoLink.java`, `V46__link_barrado_captcha.sql`, `Captcha.jsx`, `CaptchaLoginTest.java`, controllers e testes Java).
  - `src/services/api-real.js` corrigido com `comProva` e preservando `obterTokenAvaliacao` (`node --check` OK).
  - `tests/api-real-publico.test.mjs` atualizado com `captcha: 0` e teste unitario completo de `captchaChave`, `entrar` e `X-Captcha` (**15/15 testes verdes**).
  - Passo 2: `src/ui/real/AppReal.jsx` atualizado com `useCaptcha(loja.captchaChave)` no `Login`.
  - Passo 3: `src/ui/real/AgendarPublico.jsx` atualizado com `useCaptcha` em `Agendar` (`enviar`) e em `Meus` (`meus`, `cancelar`, `remarcar`, `pendenteMeus`).
  - Passo 4: `src/ui/real/LinkAgendamento.jsx` atualizado com `['captcha', 'verificação não resolvida']` em `link-barrados`.
  - Build real (`node build.mjs --real`) OK e Code Review via `Invoke-AiPipeline.ps1 -Operation Review` aprovado sem ressalvas.

## PROXIMO PASSO (Tarefa 2: B10 parte B - reCAPTCHA)
1. Passo 6: Criar e validar `tests/e2e117.mjs` (reCAPTCHA no login e no link do cliente, 390 px fonte larga e desktop x claro/escuro).
2. Passo 7: Atualizar a documentacao (`CLAUDE.md` v139, `DECISOES-E-DUVIDAS.md`, `docs/MAPA-API-SPRING.md`, `docs/BACKLOG-FUTURO.md`, `docs/AGUARDA-CONFIRMACAO.md`).
