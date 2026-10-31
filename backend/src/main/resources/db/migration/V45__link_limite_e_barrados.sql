-- B10: o proprietário define quantos horários abertos (a confirmar ou confirmados, daqui para frente) um mesmo cliente pode ter pelo link (de fábrica 3, como era),
-- e cada pedido barrado deixa um registro mínimo: hora, motivo e só o HASH do IP e do telefone (nunca o dado). Apagado em 30 dias.
ALTER TABLE configuracao_loja
  ADD COLUMN link_limite_abertos smallint NOT NULL DEFAULT 3 CHECK (link_limite_abertos BETWEEN 1 AND 20);

CREATE TABLE link_barrado (
  id       bigserial PRIMARY KEY,
  loja_id  uuid NOT NULL REFERENCES loja (id),
  em       timestamptz NOT NULL DEFAULT now(),
  motivo   text NOT NULL CHECK (motivo IN ('limite_cliente', 'isca', 'rapido', 'selo_invalido', 'frequencia')),
  ip_hash  text CHECK (char_length(ip_hash) <= 64),
  tel_hash text CHECK (char_length(tel_hash) <= 64)
);
CREATE INDEX link_barrado_loja_em ON link_barrado (loja_id, em DESC);

ALTER TABLE link_barrado ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_barrado FORCE ROW LEVEL SECURITY;
CREATE POLICY link_barrado_da_loja ON link_barrado
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, DELETE ON link_barrado TO agendz_app;
GRANT USAGE ON SEQUENCE link_barrado_id_seq TO agendz_app;
