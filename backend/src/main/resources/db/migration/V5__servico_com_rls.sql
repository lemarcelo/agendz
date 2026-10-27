-- Serviços da loja. Mesma trava dupla: loja_id NOT NULL + RLS. Preço e duração por porte ficam em jsonb (usado pelo tipo estética automotiva);
-- sem tabela por porte, valem preco/duracao_min.
CREATE TABLE servico (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES loja (id),
  codigo      text NOT NULL CHECK (codigo ~ '^[A-Za-z0-9._-]{1,20}$'),
  nome        text NOT NULL CHECK (length(nome) BETWEEN 1 AND 100),
  categoria   text CHECK (categoria IS NULL OR length(categoria) <= 60),
  preco       numeric(10,2) NOT NULL CHECK (preco >= 0 AND preco <= 100000),
  duracao_min integer NOT NULL CHECK (duracao_min BETWEEN 1 AND 14400),   -- 14400 = 10 dias (serviço de vários dias)
  multi_dia   boolean NOT NULL DEFAULT false,
  comissao_pct numeric(5,2) CHECK (comissao_pct IS NULL OR (comissao_pct >= 0 AND comissao_pct <= 100)),
  ativo       boolean NOT NULL DEFAULT true,
  precos      jsonb,
  duracoes    jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, codigo)   -- o código é único por loja, nunca entre lojas
);

ALTER TABLE servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico FORCE ROW LEVEL SECURITY;

CREATE POLICY servico_da_loja ON servico
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON servico TO agendz_app;
