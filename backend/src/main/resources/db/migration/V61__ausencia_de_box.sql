-- Ausência do BOX (estética, bloco G2): intervalo em que o box NÃO recebe veículo (folga, manutenção, limpeza). Espelha `ausencia` do profissional (V55).
CREATE TABLE ausencia_box (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES loja (id),
  box_id      uuid NOT NULL,
  ini         timestamptz NOT NULL,
  fim         timestamptz NOT NULL,
  dia_inteiro boolean NOT NULL DEFAULT false,
  motivo      text,
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CHECK (ini < fim),
  CHECK (fim - ini <= interval '31 days'),
  FOREIGN KEY (loja_id, box_id) REFERENCES box (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX ausencia_box_busca ON ausencia_box (loja_id, box_id, ini, fim);

ALTER TABLE ausencia_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE ausencia_box FORCE ROW LEVEL SECURITY;
CREATE POLICY ausencia_box_da_loja ON ausencia_box
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON ausencia_box TO agendz_app;
