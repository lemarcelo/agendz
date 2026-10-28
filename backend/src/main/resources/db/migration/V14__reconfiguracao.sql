-- Reconfigurar a loja (Estabelecimento > Reconfigurar) com senha e desfazer. Cada sessão autorizada pela senha do dono vira uma linha: guarda a
-- CONFIGURAÇÃO de antes (só o expediente da loja) e os ids do que a sessão criou (serviços e pessoas). Nada aqui toca dado lançado
-- (agendamentos, clientes, financeiro, comissões, histórico). Desfazer devolve o expediente e DESATIVA o que a sessão criou (nunca exclui).
CREATE TABLE reconfiguracao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id           uuid NOT NULL REFERENCES loja (id),
  usuario_id        uuid NOT NULL,
  criada_em         timestamptz NOT NULL DEFAULT now(),
  autorizada_ate    timestamptz NOT NULL,
  expediente_antes  jsonb,
  expediente_depois jsonb,
  expediente_trocado boolean NOT NULL DEFAULT false,
  servicos_criados  jsonb NOT NULL DEFAULT '[]'::jsonb,
  usuarios_criados  jsonb NOT NULL DEFAULT '[]'::jsonb,
  desfeita_em       timestamptz,
  desfeita_por      uuid,
  refeita_em        timestamptz
);

ALTER TABLE reconfiguracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconfiguracao FORCE ROW LEVEL SECURITY;
CREATE POLICY reconfiguracao_da_loja ON reconfiguracao
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON reconfiguracao TO agendz_app;
