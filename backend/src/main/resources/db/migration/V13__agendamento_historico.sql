-- Agenda (parte 5a): o que o simulador guarda além do horário. Origem do pedido, "reagendado", motivo do cancelamento,
-- status escolhido à mão (o sistema não mexe mais) e o histórico de alterações (quem, quando, o quê).
ALTER TABLE agendamento
  ADD COLUMN origem text NOT NULL DEFAULT 'painel' CHECK (origem IN ('painel', 'whatsapp', 'link', 'atendimento')),
  ADD COLUMN reagendado boolean NOT NULL DEFAULT false,
  ADD COLUMN motivo_cancelamento text CHECK (motivo_cancelamento IN ('profissional', 'cliente', 'conflito', 'falta_confirmacao')),
  ADD COLUMN status_manual_inicio timestamptz;   -- status escolhido à mão depois do horário começar: vale enquanto o `inicio` for este (remarcar libera o fluxo automático)

CREATE TABLE agendamento_evento (
  id              bigserial PRIMARY KEY,
  loja_id         uuid NOT NULL REFERENCES loja (id),
  agendamento_id  uuid NOT NULL,
  em              timestamptz NOT NULL DEFAULT now(),
  autor_id        uuid,                       -- nulo = o próprio sistema
  autor_nome      text NOT NULL CHECK (char_length(autor_nome) <= 200),
  campo           text NOT NULL CHECK (char_length(campo) <= 60),
  de              text CHECK (char_length(de) <= 400),
  para            text CHECK (char_length(para) <= 400),
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX agendamento_evento_ag ON agendamento_evento (agendamento_id, id);

ALTER TABLE agendamento_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_evento FORCE ROW LEVEL SECURITY;
CREATE POLICY agendamento_evento_da_loja ON agendamento_evento
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT ON agendamento_evento TO agendz_app;
GRANT USAGE ON SEQUENCE agendamento_evento_id_seq TO agendz_app;
