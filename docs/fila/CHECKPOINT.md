# CHECKPOINT - Agendz (fila de trabalho)

- **Data/Hora:** 2026-11-02 10:53 (America/Sao_Paulo)
- **Modelo que atualizou:** Codex + Antigravity
- **Branch ativa:** `feat/fila`
- **Tarefa atual:** Tarefa 2 em andamento: B10 parte B (reCAPTCHA)

## O que ja foi concluido
- **Tarefa 1 (B11 - v138):** Concluida e comitada em `4848f65` (14/14 testes verdes).
- **Tarefa 2 (B10 parte B) - Passos 1 e 5 concluidos:**
  - Rascunho `d98c243` trazido (`Recaptcha.java`, `CaptchaDoLink.java`, `V46__link_barrado_captcha.sql`, `Captcha.jsx`, `CaptchaLoginTest.java`, controllers e testes Java).
  - `src/services/api-real.js` corrigido com `comProva` e preservando `obterTokenAvaliacao` (`node --check` OK).
  - `tests/api-real-publico.test.mjs` atualizado com `captcha: 0` e teste unitario completo de `captchaChave`, `entrar` e `X-Captcha` (**15/15 testes verdes**).

## PROXIMO PASSO (Tarefa 2: B10 parte B - reCAPTCHA)
1. Seguir os passos 2, 3 e 4 da Tarefa 2 do `docs/PROMPT-CONTINUACAO-VSCODE.md`:
   - Passo 2: `src/ui/real/AppReal.jsx` (componente `Login` usando `useCaptcha(loja.captchaChave)`).
   - Passo 3: `src/ui/real/AgendarPublico.jsx` (usar `useCaptcha` em `enviar` e em `Meus`).
   - Passo 4: `src/ui/real/LinkAgendamento.jsx` (acrescentar `['captcha', 'verificação não resolvida']` em `link-barrados`).
2. Depois criar o `tests/e2e117.mjs` (passo 6) e atualizar os docs (passo 7).
