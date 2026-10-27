-- Primeira tabela de negócio, já com a trava dupla do isolamento entre lojas:
-- loja_id NOT NULL + Row Level Security (SET LOCAL app.loja_id por transação). Sem app.loja_id a consulta devolve zero linhas.

CREATE TABLE cliente (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id   uuid NOT NULL REFERENCES loja (id),
  nome      text NOT NULL,
  telefone  text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, telefone)   -- unicidade sempre por loja
);

ALTER TABLE cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente FORCE ROW LEVEL SECURITY;

CREATE POLICY cliente_da_loja ON cliente
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON cliente TO agendz_app;
