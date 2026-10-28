-- 5d-4c-2: cupons e vales (Estabelecimento > Cupons) e a aplicação a um agendamento futuro.
-- A chave (XXXX-XXXX-XXXX, 60 bits) é gerada SÓ no servidor e só o proprietário (ou quem tem a seção Estabelecimento) a vê. O uso é DERIVADO dos agendamentos
-- que não estão cancelados (não existe contador). O agendamento guarda uma FOTO do cupom (nome, tipo, serviços, valores) e o desconto de cada serviço:
-- mudar o cupom depois não altera horários que já o usaram, e a comissão usa o valor com desconto.
CREATE TABLE cupom (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id          uuid NOT NULL REFERENCES loja (id),
  nome             text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 60),
  tipo             text NOT NULL CHECK (tipo IN ('servico', 'percentual', 'valor')),
  percentual       numeric(5,2) CHECK (percentual IS NULL OR (percentual >= 1 AND percentual <= 100)),
  valor            numeric(10,2) CHECK (valor IS NULL OR (valor > 0 AND valor <= 10000)),
  inicio           date NOT NULL,
  fim              date NOT NULL,
  usos_max         integer NOT NULL CHECK (usos_max BETWEEN 1 AND 10000),
  usos_por_cliente integer NOT NULL CHECK (usos_por_cliente BETWEEN 1 AND 100),
  chave            text NOT NULL CHECK (chave ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  criado_por       uuid,
  CHECK (fim >= inicio),
  UNIQUE (loja_id, id)
);
CREATE UNIQUE INDEX cupom_chave_unica ON cupom (loja_id, chave);

-- Serviços que o cupom cobre (vazio = todos, nos tipos % e R$; o vale sempre tem ao menos um).
CREATE TABLE cupom_servico (
  loja_id    uuid NOT NULL REFERENCES loja (id),
  cupom_id   uuid NOT NULL,
  servico_id uuid NOT NULL,
  PRIMARY KEY (cupom_id, servico_id),
  FOREIGN KEY (loja_id, cupom_id) REFERENCES cupom (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, servico_id) REFERENCES servico (loja_id, id)
);

-- Chaves erradas seguidas por quem tenta (usuário do painel ou, na fatia 5e, o telefone): 5 erros bloqueiam por 15 minutos.
CREATE TABLE cupom_tentativa (
  loja_id uuid NOT NULL REFERENCES loja (id),
  quem    text NOT NULL CHECK (char_length(quem) BETWEEN 1 AND 80),
  n       integer NOT NULL DEFAULT 0,
  ate     timestamptz,
  ultima  timestamptz NOT NULL,
  PRIMARY KEY (loja_id, quem)
);

ALTER TABLE agendamento
  ADD COLUMN cupom_id          uuid,
  ADD COLUMN cupom_foto        jsonb,
  ADD COLUMN cupom_aplicado_em timestamptz,
  ADD COLUMN cupom_por         text;
ALTER TABLE agendamento ADD CONSTRAINT agendamento_cupom_fk FOREIGN KEY (loja_id, cupom_id) REFERENCES cupom (loja_id, id);
CREATE INDEX agendamento_cupom ON agendamento (loja_id, cupom_id) WHERE cupom_id IS NOT NULL;

-- Desconto do cupom em cada serviço do agendamento (nunca passa do preço). A base da comissão é preco - desconto.
ALTER TABLE agendamento_servico ADD COLUMN desconto numeric(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0 AND desconto <= preco);

ALTER TABLE cupom ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupom FORCE ROW LEVEL SECURITY;
CREATE POLICY cupom_da_loja ON cupom
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON cupom TO agendz_app;

ALTER TABLE cupom_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupom_servico FORCE ROW LEVEL SECURITY;
CREATE POLICY cupom_servico_da_loja ON cupom_servico
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON cupom_servico TO agendz_app;

ALTER TABLE cupom_tentativa ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupom_tentativa FORCE ROW LEVEL SECURITY;
CREATE POLICY cupom_tentativa_da_loja ON cupom_tentativa
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON cupom_tentativa TO agendz_app;
