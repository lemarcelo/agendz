-- Usuários da loja (dono e profissionais). Login por identificador + senha (BCrypt). Mesma trava dupla: loja_id NOT NULL + RLS.
CREATE TABLE usuario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id       uuid NOT NULL REFERENCES loja (id),
  identificador text NOT NULL,
  nome          text NOT NULL,
  papel         text NOT NULL CHECK (papel IN ('dono', 'profissional')),
  senha_hash    text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuario_identificador_minusculo CHECK (identificador = lower(identificador) AND identificador ~ '^[a-z0-9._-]{2,60}$'),
  UNIQUE (loja_id, identificador)  -- o login é único dentro da loja, nunca entre lojas
);

ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario FORCE ROW LEVEL SECURITY;

CREATE POLICY usuario_da_loja ON usuario
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON usuario TO agendz_app;
