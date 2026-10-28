-- 5d: produtos à venda (e, mais adiante, materiais de consumo) e a comissão geral do estabelecimento.
-- Mesma trava dupla das outras tabelas: loja_id NOT NULL + RLS. O tipo `material` já nasce previsto (consumo nos serviços, fatia seguinte do estoque);
-- por enquanto a API só cria `produto`. O nome é único por loja (sem diferenciar maiúsculas) e o código é único por loja e por tipo.
CREATE TABLE material (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id      uuid NOT NULL REFERENCES loja (id),
  tipo         text NOT NULL DEFAULT 'produto' CHECK (tipo IN ('material', 'produto')),
  codigo       text CHECK (codigo IS NULL OR codigo ~ '^[A-Za-z0-9._-]{1,20}$'),
  nome         text NOT NULL CHECK (length(nome) BETWEEN 1 AND 100),
  unidade      text NOT NULL DEFAULT 'un' CHECK (length(unidade) BETWEEN 1 AND 20),
  preco        numeric(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0 AND preco <= 100000),
  comissao_pct numeric(5,2) CHECK (comissao_pct IS NULL OR (comissao_pct > 0 AND comissao_pct <= 100)),   -- só produto; vazio ou 0 = sem comissão
  estoque      numeric(14,3) NOT NULL DEFAULT 0,
  minimo       numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimo >= 0),
  custo        numeric(10,2) NOT NULL DEFAULT 0 CHECK (custo >= 0),
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX material_nome_unico ON material (loja_id, lower(nome));
CREATE UNIQUE INDEX material_codigo_unico ON material (loja_id, tipo, lower(codigo)) WHERE codigo IS NOT NULL;

ALTER TABLE material ENABLE ROW LEVEL SECURITY;
ALTER TABLE material FORCE ROW LEVEL SECURITY;
CREATE POLICY material_da_loja ON material
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON material TO agendz_app;

-- Configuração por loja (uma linha por loja; sem linha = valores de fábrica). Aqui entra a comissão geral: a última da ordem serviço > funcionário > estabelecimento.
CREATE TABLE configuracao_loja (
  loja_id         uuid PRIMARY KEY REFERENCES loja (id),
  comissao_padrao numeric(5,2) CHECK (comissao_padrao IS NULL OR (comissao_padrao >= 0 AND comissao_padrao <= 100)),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE configuracao_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracao_loja FORCE ROW LEVEL SECURITY;
CREATE POLICY configuracao_loja_da_loja ON configuracao_loja
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON configuracao_loja TO agendz_app;
