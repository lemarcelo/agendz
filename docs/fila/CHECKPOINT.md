# CHECKPOINT - Agendz (fila de trabalho)

- **Data/Hora:** 2026-11-02 12:37 (America/Sao_Paulo)
- **Modelo que atualizou:** Antigravity (Gemini 4 Argon)
- **Branch ativa:** `feat/fila`
- **Tarefa atual:** Tarefa 4 concluída (B1 - Modo homologação por cliente, v140)

## O que já foi concluído
- **Tarefa 1 (B11 - v138):** Concluída e comitada em `4848f65`.
- **Tarefa 2 (B10 parte B / B4 - v139):** Concluída e comitada em `a28bbd3`.
- **Tarefa 3 (B9a - campos do link e reconfigurar):** Concluída e verificada (100% implementada no front e testes).
- **Tarefa 4 (B1 - Modo homologação por cliente, v140):**
  - Backend: Migração `V47__modo_homologacao.sql` com tabela `loja_homologacao`, colunas `teste` e `teste_sessao`, triggers automáticos e atualização de políticas RLS.
  - Backend Java: `LojaRepository.emHomologacao`, `LojaPublicaController` expondo `emHomologacao: boolean`, `PlataformaService` e `PlataformaInternaController` com rotas internas `/interno/plataforma/lojas/{slug}/homologacao/**`.
  - Frontend Real (`agendz`): `emHomologacao` lido em `carregarLoja()`, faixa fixa `.faixa-homologacao` (`Modo de homologação ativo — lançamentos são de teste; mensagens e cobranças estão desativadas.`) visível no login, painel e autoatendimento público (`#agendar`).
  - Frontend Admin (`agendz-admin`): Aba "Modo de teste" na ficha do cliente com formulário de ativação com motivo e desativação com opções (manter configurações e/ou manter lançamentos reais); integrado no `api-real.js` e comitado no repo admin (`8cf076e`).
  - Testes: `tests/e2e118.mjs` criado e validado com **8/8 cenários verdes** (mobile 390 px e desktop 1280 px x temas claro e escuro). Testes estáticos 13/13 verdes.

## PRÓXIMO PASSO (Tarefa 5: B2 - Log de ações dos usuários no Admin)
1. **Banco / Backend:**
   - Criar migração `V48__log_acao.sql`: tabela `log_acao` (`id`, `loja_id`, `usuario_id`, `usuario_nome`, `papel`, `acao`, `tipo_objeto`, `objeto_id`, `resumo`, `origem`, `criado_em`).
   - Serviço e rota interna para gravação e consulta paginada/filtrada por período e usuário (`GET /interno/plataforma/lojas/{slug}/atividades`).
2. **Frontend Admin:**
   - Adicionar aba "Atividade" na ficha do cliente e tela global de auditoria para o Admin.
3. Testes unitários e e2e correspondentes.
