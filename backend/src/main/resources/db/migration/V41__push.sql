-- Aviso com o app fechado (v130; Web Push, RFC 8030/8291/8292): cada aparelho/navegador da pessoa que ativou guarda aqui a inscrição que o navegador entregou
-- (endpoint do serviço de push + duas chaves públicas do aparelho). Nada disso é senha: serve só para o servidor enviar uma mensagem criptografada ao aparelho.
-- Inscrição que o serviço de push diz que morreu (404/410) é apagada; a pessoa apagada leva as dela (FK).
CREATE TABLE push_inscricao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id       uuid NOT NULL REFERENCES loja (id),
  usuario_id    uuid NOT NULL,
  endpoint      text NOT NULL CHECK (char_length(endpoint) BETWEEN 20 AND 600),
  p256dh        text NOT NULL CHECK (char_length(p256dh) BETWEEN 80 AND 100),
  auth          text NOT NULL CHECK (char_length(auth) BETWEEN 20 AND 30),
  aparelho      varchar(60) NOT NULL DEFAULT 'Este aparelho',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  ultimo_envio  timestamptz,
  falhas        smallint NOT NULL DEFAULT 0,
  UNIQUE (loja_id, endpoint),
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX push_inscricao_do_usuario ON push_inscricao (loja_id, usuario_id);

ALTER TABLE push_inscricao ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_inscricao FORCE ROW LEVEL SECURITY;
CREATE POLICY push_inscricao_da_loja ON push_inscricao
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON push_inscricao TO agendz_app;

-- Quando o aviso do painel já foi empurrado aos aparelhos (uma vez só, mesmo com várias instâncias do servidor).
ALTER TABLE aviso_painel ADD COLUMN push_em timestamptz;
-- Os que já existem não disparam nada ao ligar o recurso.
UPDATE aviso_painel SET push_em = now() WHERE push_em IS NULL;
