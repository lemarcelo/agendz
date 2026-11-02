-- B2: Log de acoes dos usuarios no Admin
-- Registra acoes operacionais e de configuracao da equipe por cliente (loja).
-- O resumo nunca guarda dados pessoais do cliente final (CPF, telefone completo).

CREATE TABLE log_acao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja(id) ON DELETE CASCADE,
  usuario_id      uuid,
  usuario_nome    text NOT NULL,
  papel           text NOT NULL,
  acao            text NOT NULL,
  tipo_objeto     text NOT NULL,
  objeto_id       text,
  resumo          text NOT NULL,
  origem          text NOT NULL DEFAULT 'web',
  teste           boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_log_acao_loja_criado ON log_acao (loja_id, criado_em DESC);
CREATE INDEX idx_log_acao_loja_usuario ON log_acao (loja_id, usuario_id);

ALTER TABLE log_acao ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_acao FORCE ROW LEVEL SECURITY;

CREATE POLICY log_acao_da_loja ON log_acao
  USING (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
    AND (
      teste = false 
      OR EXISTS (
        SELECT 1 FROM loja_homologacao lh 
        WHERE lh.loja_id = log_acao.loja_id AND lh.ativo = true
      )
    )
  )
  WITH CHECK (
    loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
  );

GRANT SELECT, INSERT ON log_acao TO agendz_app;
