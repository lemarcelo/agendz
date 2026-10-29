-- Avisos do painel (F2 5e-2): o que o cliente fez pelo link (pediu horário, remarcou, cancelou) aparece para a loja.
-- O profissional do horário vê os seus; dono e equipe com acesso à agenda veem todos. Só texto curto (nome do cliente, nunca telefone/CPF).
CREATE TABLE aviso_painel (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja (id),
  agendamento_id  uuid,
  profissional_id uuid,
  tipo            text NOT NULL CHECK (tipo IN ('pedido', 'remarcou', 'cancelou')),
  texto           text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 300),
  lido            boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, id),
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX aviso_painel_loja ON aviso_painel (loja_id, lido, criado_em DESC);

ALTER TABLE aviso_painel ENABLE ROW LEVEL SECURITY;
ALTER TABLE aviso_painel FORCE ROW LEVEL SECURITY;
CREATE POLICY aviso_painel_da_loja ON aviso_painel
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON aviso_painel TO agendz_app;
