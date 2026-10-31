-- Aparelhos confiáveis (v125, B8): a pessoa pede "confiar neste aparelho" logo depois de entrar e o servidor emite um token longo (365 dias) que carrega só o id
-- desta linha. Vale em qualquer rede, enquanto a linha existir e a pessoa estiver ativa com o mesmo papel; sem uso por 90 dias deixa de valer. "Sair", trocar a
-- senha, remover o aparelho e apagar a pessoa apagam a linha (o token morre na hora). Nenhum segredo fica aqui: o token é assinado, a linha só diz "ainda vale".
CREATE TABLE aparelho_confiavel (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES loja (id),
  usuario_id  uuid NOT NULL,
  rotulo      varchar(60) NOT NULL DEFAULT 'Este aparelho',
  criado_em   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX aparelho_confiavel_do_usuario ON aparelho_confiavel (loja_id, usuario_id);

ALTER TABLE aparelho_confiavel ENABLE ROW LEVEL SECURITY;
ALTER TABLE aparelho_confiavel FORCE ROW LEVEL SECURITY;
CREATE POLICY aparelho_confiavel_da_loja ON aparelho_confiavel
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON aparelho_confiavel TO agendz_app;
