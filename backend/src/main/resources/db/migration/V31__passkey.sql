-- Login por digital/rosto/PIN do aparelho (passkey, WebAuthn). A pessoa cadastra em Meu perfil (confirmando a senha); a senha continua valendo.
-- Guarda só a parte PÚBLICA da credencial (a privada nunca sai do aparelho). Contador: se não crescer, a credencial foi clonada e a entrada é recusada.
CREATE TABLE passkey (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id       uuid NOT NULL REFERENCES loja (id),
  usuario_id    uuid NOT NULL,
  credencial_id bytea NOT NULL CHECK (octet_length(credencial_id) BETWEEN 16 AND 1023),
  chave_publica bytea NOT NULL CHECK (octet_length(chave_publica) BETWEEN 32 AND 2048),
  alg           integer NOT NULL CHECK (alg IN (-7, -257)),
  contador      bigint NOT NULL DEFAULT 0,
  nome          varchar(60) NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  ultimo_uso    timestamptz,
  UNIQUE (loja_id, credencial_id),
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX passkey_do_usuario ON passkey (loja_id, usuario_id);

ALTER TABLE passkey ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey FORCE ROW LEVEL SECURITY;
CREATE POLICY passkey_da_loja ON passkey
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON passkey TO agendz_app;
