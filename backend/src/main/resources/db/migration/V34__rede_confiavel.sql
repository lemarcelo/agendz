-- Redes confiáveis (v119): a pessoa pede "login automático" numa rede e o servidor guarda só um HASH do IP público de onde ela entrou (IPv4 inteiro,
-- IPv6 pelo prefixo /64). Nessa rede a sessão não vence; fora dela o token vale 24 h. `versao` sobe quando a pessoa sai: o token antigo deixa de valer.
-- Nunca se guarda o IP em texto puro. Remover a linha encerra a confiança na hora (o filtro de redes lê esta tabela a cada pedido de um token longo).
CREATE TABLE rede_confiavel (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES loja (id),
  usuario_id  uuid NOT NULL,
  rede_hash   varchar(64) NOT NULL,
  rotulo      varchar(60) NOT NULL DEFAULT 'Esta rede',
  versao      integer NOT NULL DEFAULT 1,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz,
  UNIQUE (loja_id, usuario_id, rede_hash),
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX rede_confiavel_do_usuario ON rede_confiavel (loja_id, usuario_id);

ALTER TABLE rede_confiavel ENABLE ROW LEVEL SECURITY;
ALTER TABLE rede_confiavel FORCE ROW LEVEL SECURITY;
CREATE POLICY rede_confiavel_da_loja ON rede_confiavel
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON rede_confiavel TO agendz_app;
