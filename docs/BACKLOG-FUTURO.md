# Backlog futuro (ideias pedidas pelo Marcelo, para fazer depois)

Regra de uso: toda funcionalidade nova pedida entra aqui com prioridade oficial alinhada a `BACKLOG.md` e `SESSAO.md`. Não alterar a ordem sem ordem expressa do Marcelo.

17. **Menu "Relatórios" alterado para "Faturamento" com Ícone de Cifrão ($)**:
    - Alterar o nome do menu 'Relatórios' para 'Faturamento'.
    - Mudar o ícone do menu de lista para cifrão ($).
    - Atualizar título da tela e preservar regras de acesso exclusivas do proprietário.

18. **Agenda — Novas Abas "Atendimentos do Mês" e "Comissões" + Transição Suave Global de Abas**:
    - Adicionar na tela principal da Agenda as abas 'Atendimentos do mês' e 'Comissões'.
    - Eliminar troca abrupta de abas em todo o sistema, tornando a alternância fluida e suave com transição CSS.
    - Regra mandatória para todas as abas do sistema em futuras revisões.

19. **Faturamento (Relatórios) — Redesign de Layout e Hints Explicativos (Hover PC / Toque Mobile)**:
    - Redesign da tela de Faturamento com cards de KPIs e organização mais intuitiva.
    - Hints explicativos obrigatórios em cada bloco de resultado (hover no PC, toque no celular).
    - Padronização dessa regra de balãozinho explicativo para todos os relatórios do sistema.
    - Execução e revisão priorizando modelo econômico e testes automatizados.

---
## 🚀 Fila Imediata do Backlog (Ordem Priorizada)

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

10. **Planos — Correção na Tela de Extrato (Histórico por Data)**:
    - Corrigir a tela de extrato de planos para apresentar o histórico cronológico ordenado por data e corrigir eventuais inconsistências na listagem e agrupamento de movimentações/utilizações.

11. **Planos — Nova Aba "Clientes"**:
    - Adicionar aba "Clientes" no menu de Planos.
    - Permitir buscar por clientes cadastrados.
    - Permitir vincular/incluir plano diretamente para o cliente selecionado.
    - Permitir inclusão de plano com vigência por período específico.

12. **Planos — Nova Aba "Pagamentos" com Cobrança e Relatórios**:
    - Adicionar aba "Pagamentos" no menu de Planos.
    - Permitir envio de mensagem de cobrança de pagamento (utilizando mensagens/modelos já cadastrados no módulo de Mensagens).
    - Opção interna de "Relatórios":
      - Visualização de relatórios de planos e extratos de pagamentos.
      - Filtros de visualização por plano ou por cliente.
      - Filtro por período de datas, com padrão inicial pré-selecionado de 6 meses.

13. **Autoagendamento — Oferta de Plano ao Concluir Agendamento**:
    - Ao concluir um agendamento com sucesso pelo link público / tela de confirmação, exibir cartão ou modal com oferta de plano/assinatura para o cliente.

14. **Padronização Visual Global — Modais para Edições e Detalhes**:
    - Todos os botões sobre seções ou cards que acionam edições, alterações ou exibição de detalhes devem obrigatoriamente abrir em **modal** (nunca expandir desalinhado ou quebrar a navegação na mesma tela).
    - Regras estritas do modal:
      - Clicar fora (no backdrop escuro) fecha o modal imediatamente.
      - Fechamento disponível por botão fechar e tecla `Escape`.
      - Trava total de scroll na tela de baixo (`body` sem rolagem externa) e `overscroll-behavior: contain`.
    - **Escopo desta solicitação:** Realizar auditoria e validação visual de ponta a ponta em **toda a aplicação** para garantir a conformidade dessa regra de modais em todos os cards e seções existentes.
    - **Diretriz de Testes Inteligentes:** Nas próximas alterações/implementações visuais, os testes não devem rodar a aplicação inteira, mas focar inteligentemente apenas nas telas alteradas e novos fluxos de impacto visual.

15. **Google Authenticator — intervalo de 8 horas**:
    - Após a primeira validação pelo Google Authenticator, não solicitar outro código durante 8 horas; após esse período, voltar a pedir a validação.
    - Escopo inicial: autenticação do painel administrativo. Confirmar os detalhes de sessão, aparelho e encerramento antes da implementação.

16. **Admin — corrigir instalação como aplicativo PWA**:
    - Investigar e corrigir a instalação do painel administrativo como aplicativo PWA, verificando o fluxo e os requisitos de instalação nos dispositivos e navegadores compatíveis.

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
