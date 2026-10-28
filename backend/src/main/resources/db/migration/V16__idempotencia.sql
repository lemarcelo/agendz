-- Chave de repetição (Idempotency-Key): quem manda o mesmo pedido de novo (resposta perdida, internet que caiu) recebe a MESMA resposta e nada é gravado duas vezes.
-- A chave é gravada na mesma transação do pedido: se o pedido falha, a chave também volta atrás e o pedido pode ser tentado de novo.
CREATE TABLE idempotencia (
  loja_id     uuid NOT NULL REFERENCES loja (id),
  chave       text NOT NULL CHECK (chave ~ '^[A-Za-z0-9_-]{16,64}$'),
  usuario_id  uuid NOT NULL,
  rota        text NOT NULL CHECK (char_length(rota) <= 100),
  corpo_hash  text NOT NULL,
  resposta    text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, chave)
);
CREATE INDEX idempotencia_criado ON idempotencia (criado_em);

ALTER TABLE idempotencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotencia FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotencia_da_loja ON idempotencia
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON idempotencia TO agendz_app;
