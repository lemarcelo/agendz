# CHECKPOINT - Agendz (fila de trabalho)

- **Data/Hora:** 2026-11-02 12:45 (America/Sao_Paulo)
- **Modelo que atualizou:** Antigravity (Gemini 4 Argon)
- **Branch ativa:** `feat/fila`
- **Status:** TODAS AS TAREFAS PENDENTES ATÉ O B3 FORAM CONCLUÍDAS COM SUCESSO!

## Resumo das Tarefas Concluídas
1. **Tarefa 1 (B11 - v138):** Aviso de avaliação pelo link. Concluída em `4848f65`.
2. **Tarefa 2 (B10 parte B / B4 - v139):** reCAPTCHA v2 no login e autoatendimento. Concluída em `a28bbd3`.
3. **Tarefa 3 (B9a):** Campos obrigatórios do link no Primeiro Acesso, Reconfigurar e Estabelecimento. Concluída e verificada.
4. **Tarefa 4 (B1 - v140):** Modo homologação por cliente. Migração `V47__modo_homologacao.sql`, RLS, triggers, rotas internas, faixa fixa no front e controle no Admin. Concluída em `54ba0e3`.
5. **Tarefa 5 (B2 - v141):** Log de ações dos usuários. Migração `V48__log_acao.sql`, rotas internas no backend e aba "Atividade" na ficha do cliente no Admin. Concluída em `ada962d` e `a0362cd`.
6. **Tarefa 6 (B5 - v142):** Relatório de funil do link de agendamento. Migração `V49__evento_funil.sql`, rotas internas agregadas e aba "Funil do link" no Admin. Concluída em `77cec24` e `d63bcf3`.
7. **Tarefa 7 (B3 - v143):** Poder trocar o domínio DNS da plataforma sem dor. `src/dominio.js` com `dominioDoPainel` dinâmico, testes estáticos `tests/dominio.test.mjs` no `agendz` e no `agendz-admin`, e roteiro completo em `docs/TROCA-DE-DOMINIO.md`. Concluída em `805832d` no admin.
8. **reCAPTCHA Próprio por Loja (v144):** Delegação da chave pública e segredo por loja (`V50__recaptcha_por_loja.sql`, fallback global na plataforma, campos em Estabelecimento > Regras).
9. **Tela Atender (Autoestética - v145):** Porte em caixas (`.pub-portes`, `.pub-porte`), veículo e porte no topo da lista por padrão e reordenação de todo o fluxo disponível em Regras.

## Status da Trava e Próximos Passos
- Trava liberada para `LIVRE`.
- Todos os testes estáticos (13/13) e testes unitários (1037/1037) passando.
- Pronto para merge `feat/fila` -> `main` e deploy na VPS.
