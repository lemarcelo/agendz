# CHECKPOINT - Agendz (fila de trabalho)

- **Data/Hora:** 2026-11-02 12:42 (America/Sao_Paulo)
- **Modelo que atualizou:** Antigravity (Gemini 4 Argon)
- **Branch ativa:** `feat/fila`
- **Tarefa atual:** Tarefa 6 concluída (B5 - Relatório de uso do link de agendamento no Admin, v142)

## O que já foi concluído
- **Tarefa 1 (B11 - v138):** Concluída e comitada em `4848f65`.
- **Tarefa 2 (B10 parte B / B4 - v139):** Concluída e comitada em `a28bbd3`.
- **Tarefa 3 (B9a - campos do link e reconfigurar):** Concluída e verificada no front e testes.
- **Tarefa 4 (B1 - Modo homologação por cliente, v140):** Concluída e comitada em `54ba0e3`.
- **Tarefa 5 (B2 - Log de ações dos usuários no Admin, v141):** Concluída e comitada em `ada962d`.
- **Tarefa 6 (B5 - Relatório de uso do link de agendamento no Admin, v142):**
  - Backend: Migração `V49__evento_funil.sql` criando tabela `evento_funil` com RLS e suporte a flag `teste` (B1).
  - Backend Java: `PlataformaService.metricasFunil` e `registrarEventoFunil`; rota interna `GET /interno/plataforma/lojas/{slug}/funil` em `PlataformaInternaController`.
  - Frontend Admin: Suporte em `api-real.js` (`API.clientes.funil`) e aba "Funil do link" na ficha do cliente (`Clientes.jsx`) com cartões de indicadores (links enviados, agendados pelo link, cancelamentos, taxa de conversão) e barras de funil por etapa (`styles.css`). Comitado em `d63bcf3` no repo admin.
  - Testes: Testes estáticos 13/13 verdes no `agendz`; 64/64 testes verdes no `agendz-admin`.

## PRÓXIMO PASSO (Tarefa 7: B3 - Poder trocar o domínio DNS do Agendz depois)
1. **Regra e Proteção de Domínio (`agendz` e `agendz-admin`):**
   - Criar `tests/dominio.test.mjs` no `agendz` que valida se o domínio base não está hardcoded de forma indevida fora das variáveis e dos padrões permitidos (`DOMINIO`, `AGENDZ_DOMINIOS_BASE`, CI/CD e defaults documentados).
   - Criar `docs/TROCA-DE-DOMINIO.md` com o roteiro completo passo a passo para troca de domínio (DNS, Caddy, variáveis de ambiente nos repositórios e deploy).
   - Testar suíte estática e de unidade nos dois repositórios.
