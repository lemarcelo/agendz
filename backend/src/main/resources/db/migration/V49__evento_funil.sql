-- B5: Relatorio de uso do link de agendamento no Admin
-- Registra eventos do funil de agendamento (abertura, passos, agendado, cancelado)
-- Contagens agregadas para analise do processo; nunca guarda nomes, CPFs ou telefones.

CREATE TABLE evento_funil (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja(id) ON DELETE CASCADE,
  tipo_evento     text NOT NULL,
  etapa           text,
  visita_hash     text,
  teste           boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evento_funil_loja_criado ON evento_funil (loja_id, criado_em);
CREATE INDEX idx_evento_funil_tipo ON evento_funil (loja_id, tipo_evento, etapa);

ALTER TABLE evento_funil ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_funil FORCE ROW LEVEL SECURITY;

CREATE POLICY evento_funil_da_loja ON evento_funil
  USING (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
    AND (
      teste = false 
      OR EXISTS (
        SELECT 1 FROM loja_homologacao lh 
        WHERE lh.loja_id = evento_funil.loja_id AND lh.ativo = true
      )
    )
  )
  WITH CHECK (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
  );

GRANT SELECT, INSERT ON evento_funil TO agendz_app;
