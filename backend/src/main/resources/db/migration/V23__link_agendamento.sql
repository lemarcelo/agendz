-- Link de agendamento do cliente (F2 5e-1): o cliente final, sem login, vê horários livres, agenda, acompanha e cancela o que é dele.
-- 1) A loja liga/desliga o link e limita até quantos dias à frente ele oferece horário (sem linha = ligado, 30 dias).
-- 2) Cada pedido feito pelo link gera um acesso (token) VÁLIDO SÓ PARA AQUELE agendamento: quem tem o token de um horário não enxerga os outros
--    horários do mesmo cliente (o simulador amarrava o token ao cliente; aqui ficou mais fechado). Só o hash (SHA-256) fica no banco.
ALTER TABLE configuracao_loja
  ADD COLUMN link_ativo    boolean  NOT NULL DEFAULT true,
  ADD COLUMN link_dias_max smallint NOT NULL DEFAULT 30 CHECK (link_dias_max BETWEEN 1 AND 60);

CREATE TABLE acesso_publico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja (id),
  agendamento_id  uuid NOT NULL,
  token_hash      text NOT NULL CHECK (char_length(token_hash) = 64),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  expira_em       timestamptz NOT NULL,
  UNIQUE (loja_id, token_hash),
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX acesso_publico_ag ON acesso_publico (agendamento_id);

ALTER TABLE acesso_publico ENABLE ROW LEVEL SECURITY;
ALTER TABLE acesso_publico FORCE ROW LEVEL SECURITY;
CREATE POLICY acesso_publico_da_loja ON acesso_publico
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, DELETE ON acesso_publico TO agendz_app;
