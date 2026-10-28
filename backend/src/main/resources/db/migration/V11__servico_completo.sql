-- Serviços de verdade (F2 parte 3): combo (junta de 2 a 10 serviços comuns), antecedência mínima e intervalo de até 24 h.
-- Notificações próprias, materiais, confirmação e grupo financeiro do serviço entram junto com Mensagens, Estoque e Financeiro.
ALTER TABLE servico DROP CONSTRAINT IF EXISTS servico_intervalo_min_check;
ALTER TABLE servico ADD CONSTRAINT servico_intervalo_min_check CHECK (intervalo_min BETWEEN 0 AND 1440);

ALTER TABLE servico
  ADD COLUMN antecedencia_h integer NOT NULL DEFAULT 0 CHECK (antecedencia_h BETWEEN 0 AND 8760),
  ADD COLUMN combo          boolean NOT NULL DEFAULT false;

CREATE TABLE servico_componente (
  loja_id        uuid NOT NULL REFERENCES loja (id),
  combo_id       uuid NOT NULL,
  componente_id  uuid NOT NULL,
  ordem          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (combo_id, componente_id),
  CHECK (combo_id <> componente_id),
  FOREIGN KEY (loja_id, combo_id) REFERENCES servico (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, componente_id) REFERENCES servico (loja_id, id)   -- serviço usado num combo não é apagado, só desativado
);
ALTER TABLE servico_componente ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico_componente FORCE ROW LEVEL SECURITY;
CREATE POLICY servico_componente_da_loja ON servico_componente
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON servico_componente TO agendz_app;
