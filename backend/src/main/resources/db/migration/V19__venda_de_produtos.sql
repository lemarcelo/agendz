-- 5d-4a: produtos vendidos no atendimento (Atender e ficha) e a baixa de estoque, com o histórico de movimentos.
-- Preço e percentual de comissão do produto são CONGELADOS na linha (mudar o produto depois não muda o que já foi vendido). O percentual fica só no
-- banco (a base da comissão, 5d-4b): a resposta da API da agenda nunca o mostra. `baixado` é quanto já saiu do estoque por esta linha: o estoque só sai
-- quando o atendimento está concluído e a diferença (baixado × quantidade) é a única coisa que se move, então repetir a rotina nunca baixa duas vezes.
ALTER TABLE material ADD CONSTRAINT material_loja_id_uq UNIQUE (loja_id, id);

CREATE TABLE agendamento_produto (
  loja_id        uuid NOT NULL REFERENCES loja (id),
  agendamento_id uuid NOT NULL,
  material_id    uuid NOT NULL,
  nome           text NOT NULL,
  qtd            integer NOT NULL CHECK (qtd BETWEEN 1 AND 999),
  preco          numeric(10,2) NOT NULL CHECK (preco >= 0 AND preco <= 100000),
  comissao_pct   numeric(5,2) NOT NULL DEFAULT 0 CHECK (comissao_pct >= 0 AND comissao_pct <= 100),   -- 0 = sem comissão
  vendedor_id    uuid NOT NULL,
  baixado        integer NOT NULL DEFAULT 0 CHECK (baixado >= 0),
  PRIMARY KEY (agendamento_id, material_id),
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, material_id) REFERENCES material (loja_id, id),
  FOREIGN KEY (loja_id, vendedor_id) REFERENCES usuario (loja_id, id)
);

CREATE TABLE movimento_estoque (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id        uuid NOT NULL REFERENCES loja (id),
  material_id    uuid NOT NULL,
  em             timestamptz NOT NULL DEFAULT now(),
  tipo           text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  delta          numeric(14,3) NOT NULL,      -- positivo entra, negativo sai
  saldo          numeric(14,3) NOT NULL,      -- estoque depois do movimento
  agendamento_id uuid,
  obs            text CHECK (obs IS NULL OR char_length(obs) <= 200),
  autor_id       uuid,                        -- nulo = o próprio sistema
  FOREIGN KEY (loja_id, material_id) REFERENCES material (loja_id, id)
);
CREATE INDEX movimento_estoque_material ON movimento_estoque (loja_id, material_id, em DESC);

ALTER TABLE agendamento_produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_produto FORCE ROW LEVEL SECURITY;
CREATE POLICY agendamento_produto_da_loja ON agendamento_produto
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

ALTER TABLE movimento_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimento_estoque FORCE ROW LEVEL SECURITY;
CREATE POLICY movimento_estoque_da_loja ON movimento_estoque
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON agendamento_produto TO agendz_app;
GRANT SELECT, INSERT ON movimento_estoque TO agendz_app;
