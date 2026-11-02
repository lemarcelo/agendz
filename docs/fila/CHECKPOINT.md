# CHECKPOINT â€” Agendz (fila de trabalho)

- **Data/Hora:** 2026-11-02 00:13 (America/Sao_Paulo)
- **Modelo que atualizou:** Antigravity (Gemini 3.8 Flash)
- **Branch ativa:** eat/fila
- **Tarefa atual:** Tarefa 1: B11 â€” Aviso de avaliacao para o cliente

## O que foi feito neste passo
- **B11 Passo 1 concluido:** Texto de aviso data-testid="pub-feito-avaliar" no fim do agendamento (pub-feito).
- **B11 Passo 2 concluido:** Em src/ui/real/AgendarPublico.jsx (componente Meus):
  1. Adicionada consulta automatica a cada 60 s e ao voltar a visibilidade da aba via useAtualizacaoAutomatica.
  2. Adicionado o bloco data-testid="pub-avaliar-<id>" nos cartoes concluidos sem avaliacao, com o texto *"Seu atendimento foi concluÃ­do. Conte como foi"* e botao de avaliacao.

## Testes executados e status
- 
ode --test tests/api-real-publico.test.mjs: 13 passaram (0 falhas).

## PRÃ“XIMO PASSO
**Passo 3 do B11 (Servidor Java):**
Criar a rota publica POST /api/publico/agendamentos/{id}/avaliacao com cabecalho X-Acesso:
- Local: ackend/src/main/java/com/agendz/api/avaliacao/ (e liberar rota publica em SegurancaConfig.java).
- Regras: token precisa bater com o agendamento; status = 'concluido'; sem avaliacao anterior; devolve { avaliarToken } reaproveitando a geracao de token de avaliacao existente (hash seguro, 90 dias, uso unico); freio por IP em LimitePublico (30 por 10 min); falha = 404 generico.
- Criar teste Java de isolamento e regra em ackend/src/test/java/.../AvaliacoesTest.java ou LinkPublicoTest.java.
- Commitar: WIP[b11/passo3]: endpoint publico POST /api/publico/agendamentos/{id}/avaliacao no servidor.

## Pendencias e Decisoes
- Abertura de avaliacao no front navega para #avaliar/<avaliarToken> via hash fragment.