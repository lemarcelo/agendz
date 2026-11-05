# Backlog futuro (ideias pedidas pelo Marcelo, para fazer depois)

Regra de uso: toda funcionalidade nova pedida entra aqui com prioridade oficial alinhada a `BACKLOG.md` e `SESSAO.md`. Não alterar a ordem sem ordem expressa do Marcelo.

---

## 🚀 Fila Imediata do Backlog (Ordem Priorizada: 1 a 9)

1. **Admin — Imagens e Design dos Chamados de Suporte**:
   - Corrigir o carregamento de imagens/anexos enviados pelos clientes que não abrem no painel de chamados do `agendz-admin`.
   - Unificar a interface de chamados do admin para deixá-la visualmente idêntica à tela de suporte moderna do cliente (`Suporte.jsx` do `agendz`), com balões estilo chat, fotos e timeline limpa.

2. **Opção “Atendido” para registro anterior/imediato (etapa Quando do Atender)**:
   - Na etapa **Quando** de `src/ui/real/Atender.jsx`, adicionar o botão **Atendido** (`data-testid="atender-atendido"`) à esquerda de **Agora** (`atender-agora`), mantendo **Escolher data** (`atender-quando`).
   - Reaproveitar o envio de `POST /api/atendimentos` com status `concluido`.
   - Medir `boundingBox()` em `390px` garantindo que cabem sem rolagem lateral (`scrollWidth <= 390`) e sem sobreposição.

3. **Modal no Calendário Mensal**:
   - Ao clicar em um dia na aba Calendário (`mes-dia-YYYY-MM-DD` em `src/ui/real/Agenda.jsx`), abrir um modal listando os agendamentos e ações daquele dia (reutilizando `Cartao` e `Detalhes`), mantendo a aba Calendário ativa por trás.
   - Aplicar Trava Geral de Scroll (`travaScroll.js` / `body.trava-scroll-modal`) e `overscroll-behavior: contain`.
   - Fechar com `Escape` e botão fechar sem deixar `.detalhe-fundo-real` preso na tela; medir em `390px` e `1366px`.

4. **Aviso de atraso no cartão via WhatsApp**:
   - No modal de detalhes do agendamento, adicionar botão para envio de mensagem rápida de aviso de tolerância/atraso no WhatsApp (`https://wa.me/`), perguntando minutos (com padrão salvo em `localStorage` protegido por `try/catch`).

5. **Auditoria Contínua de Segurança**:
   - Consolidação de RLS estrito e validação estática de RBAC (permissões por papel e isolamento multi-tenant).

6. **Restrição de Dias da Semana por Serviço**:
   - Configuração no cadastro de serviço de quais dias da semana (ex.: terças e quintas) aquele serviço pode ser agendado, bloqueando os demais dias no auto-agendamento e agendamento interno.

7. **Serviços por Funcionário (Especialidades)**:
   - Matriz de quais serviços cada profissional atende, filtrando opções de serviços por funcionário no auto-agendamento público e no `Atender.jsx`.

8. **Avisos do Dia e Aba de Antigos por Período**:
   - Na tela de Avisos (`Avisos.jsx`), exibir apenas os avisos do dia atual na visão principal.
   - Criar aba "Antigos" para consulta de avisos anteriores com filtro de período (De X a Y), com campos vazios por padrão para pesquisa sob demanda.

9. **Suporte: Notificação por E-mail, IDs de Chamado, Fechamento e Histórico com Busca**:
    - Disparo de e-mail ao receber mensagem no `admin-agendz`, habilitável por cliente com configuração de e-mail destino de suporte da empresa.
    - Cada ticket recebe um ID visível e pode ser encerrado/fechado pelo admin.
    - No cliente (`Suporte.jsx`): coluna lateral à direita com "Chamados Anteriores" listando os chamados fechados do mês corrente.
    - Aba de histórico com filtro por data/período e caixa de busca universal (pesquisa por ID ou qualquer palavra do chamado).

---

## ✅ Entregas Concluídas e Já Publicadas em Produção (NÃO REFAZER)
- Menu principal do PC recolhido por padrão (`68px`), expansão por hover suave (`220px`), fechamento ao clicar e threshold de 10 cliques sem pulos visuais.
- Botão "Cancelar atendimento" renomeado em todos os detalhes do agendamento.
- Reconfigurar no rodapé com alerta crítico e frase "senha do usuário".
- Cliente parceiro completo (desconto configurável, comissão da loja e badges).
- Remoção total do módulo de avaliações.
- Admin PWA instalável, chat de chamados e autenticação TOTP (Google Authenticator).
- Grade pública de horários (Google Calendar) e blindagem anti-fraude.
- Trava Geral de Scroll em Modais (`travaScroll.js`, observador de DOM e teste Playwright de scroll 0px).
