-- Planos de serviço (v111): catálogo, assinatura do cliente, mensalidade por mês, pedido pelo link e o uso do plano num agendamento.
-- O pagamento da mensalidade é DIRETO com o profissional (o servidor só registra). O SALDO DE CORTES é DERIVADO dos agendamentos que usam o plano
-- (agendamento.plano_assinatura_id): não existe contador gravado. A assinatura guarda uma FOTO do plano (mudar o plano depois não mexe em quem já assina).
-- Toda tabela tem loja_id + RLS, e as chaves estrangeiras são COMPOSTAS (loja_id, id): o banco recusa id de outra loja mesmo que um bug o passasse.

CREATE TABLE plano (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id        uuid NOT NULL REFERENCES loja (id),
  nome           text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 60),
  descricao      text NOT NULL DEFAULT '' CHECK (char_length(descricao) <= 200),
  preco          numeric(10,2) NOT NULL CHECK (preco > 0 AND preco <= 99999),
  cortes         integer NOT NULL CHECK (cortes BETWEEN 1 AND 31),
  adianta        integer NOT NULL DEFAULT 1 CHECK (adianta BETWEEN 0 AND 3),
  acumulo_meses  integer NOT NULL DEFAULT 2 CHECK (acumulo_meses BETWEEN 1 AND 6),
  intervalo_dias integer NOT NULL DEFAULT 3 CHECK (intervalo_dias BETWEEN 0 AND 30),
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     uuid,
  UNIQUE (loja_id, id)
);
CREATE UNIQUE INDEX plano_nome_unico ON plano (loja_id, lower(nome));

-- Serviços que o plano inclui (de 1 a 10; combo não entra: a regra fica no serviço).
CREATE TABLE plano_servico (
  loja_id    uuid NOT NULL REFERENCES loja (id),
  plano_id   uuid NOT NULL,
  servico_id uuid NOT NULL,
  PRIMARY KEY (plano_id, servico_id),
  FOREIGN KEY (loja_id, plano_id) REFERENCES plano (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, servico_id) REFERENCES servico (loja_id, id)
);

CREATE TABLE assinatura (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id        uuid NOT NULL REFERENCES loja (id),
  cliente_id     uuid NOT NULL,
  plano_id       uuid NOT NULL,
  plano_foto     jsonb NOT NULL,   -- nome, preco, cortes, servicoIds, adianta, acumuloMeses, intervaloDias de quando contratou
  status         text NOT NULL CHECK (status IN ('pendente', 'ativa', 'cancelada')),
  inicio_mes     text NOT NULL CHECK (inicio_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  dia_cobranca   integer NOT NULL CHECK (dia_cobranca BETWEEN 1 AND 28),
  divida         integer NOT NULL DEFAULT 0 CHECK (divida BETWEEN 0 AND 1000),   -- cortes adiantados que ficaram sem pagar ao encerrar
  divida_quitada boolean NOT NULL DEFAULT false,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     uuid,
  encerrado_em   timestamptz,
  UNIQUE (loja_id, id),
  FOREIGN KEY (loja_id, cliente_id) REFERENCES cliente (loja_id, id),
  FOREIGN KEY (loja_id, plano_id) REFERENCES plano (loja_id, id)
);
-- Um plano em andamento (aguardando pagamento ou ativo) por cliente: o banco garante mesmo com dois pedidos ao mesmo tempo.
CREATE UNIQUE INDEX assinatura_aberta_por_cliente ON assinatura (loja_id, cliente_id) WHERE status IN ('pendente', 'ativa');

CREATE TABLE assinatura_pagamento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id        uuid NOT NULL REFERENCES loja (id),
  assinatura_id  uuid NOT NULL,
  mes            text NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  valor          numeric(10,2) NOT NULL CHECK (valor > 0 AND valor <= 99999),   -- sempre o valor do plano contratado
  forma          text NOT NULL CHECK (forma IN ('pix', 'dinheiro', 'cartao')),
  em             timestamptz NOT NULL,
  autor_id       uuid,
  autor_nome     text,
  estornado      boolean NOT NULL DEFAULT false,
  estorno_em     timestamptz,
  estorno_motivo text CHECK (estorno_motivo IS NULL OR char_length(estorno_motivo) BETWEEN 5 AND 200),
  UNIQUE (loja_id, id),
  FOREIGN KEY (loja_id, assinatura_id) REFERENCES assinatura (loja_id, id) ON DELETE CASCADE
);
-- Uma mensalidade válida por mês (estornada deixa o mês livre para registrar de novo).
CREATE UNIQUE INDEX assinatura_pagamento_mes_unico ON assinatura_pagamento (assinatura_id, mes) WHERE NOT estornado;

-- Linha do tempo da assinatura (quem contratou, pagou, estornou, encerrou).
CREATE TABLE assinatura_evento (
  id            bigserial PRIMARY KEY,
  loja_id       uuid NOT NULL REFERENCES loja (id),
  assinatura_id uuid NOT NULL,
  em            timestamptz NOT NULL,
  autor_id      uuid,
  autor_nome    text,
  acao          text NOT NULL CHECK (char_length(acao) BETWEEN 1 AND 30),
  detalhe       text NOT NULL DEFAULT '' CHECK (char_length(detalhe) <= 300),
  FOREIGN KEY (loja_id, assinatura_id) REFERENCES assinatura (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX assinatura_evento_assinatura ON assinatura_evento (loja_id, assinatura_id, id DESC);

-- Pedido feito pelo link de planos (sem login): nada vira assinatura sozinho, o dono aceita ou recusa. O telefone fica cifrado (como no cliente).
CREATE TABLE pedido_plano (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id       uuid NOT NULL REFERENCES loja (id),
  nome          text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 60),
  telefone_cif  text NOT NULL,
  telefone_hash text NOT NULL,
  plano_id      uuid NOT NULL,
  plano_nome    text NOT NULL,
  status        text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'aceito', 'recusado')),
  assinatura_id uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  resolvido_em  timestamptz,
  UNIQUE (loja_id, id),
  FOREIGN KEY (loja_id, plano_id) REFERENCES plano (loja_id, id),
  FOREIGN KEY (loja_id, assinatura_id) REFERENCES assinatura (loja_id, id)
);
CREATE INDEX pedido_plano_novos ON pedido_plano (loja_id, status, criado_em DESC);
-- O mesmo telefone pedindo o mesmo plano duas vezes (ou dois cliques ao mesmo tempo) não duplica o pedido aberto.
CREATE UNIQUE INDEX pedido_plano_aberto_unico ON pedido_plano (loja_id, telefone_hash, plano_id) WHERE status = 'novo';

-- Uso do plano no agendamento: o corte gasto é o do mês do `inicio`. Nos serviços que o plano cobre, desconto = preço (a comissão usa preço − desconto).
ALTER TABLE agendamento
  ADD COLUMN plano_assinatura_id uuid,
  ADD COLUMN plano_nome          text,
  ADD COLUMN plano_em            timestamptz;
ALTER TABLE agendamento ADD CONSTRAINT agendamento_plano_fk FOREIGN KEY (loja_id, plano_assinatura_id) REFERENCES assinatura (loja_id, id);
CREATE INDEX agendamento_plano ON agendamento (loja_id, plano_assinatura_id, inicio) WHERE plano_assinatura_id IS NOT NULL;
ALTER TABLE agendamento_servico ADD COLUMN plano boolean NOT NULL DEFAULT false;

ALTER TABLE plano ENABLE ROW LEVEL SECURITY;
ALTER TABLE plano FORCE ROW LEVEL SECURITY;
CREATE POLICY plano_da_loja ON plano
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON plano TO agendz_app;

ALTER TABLE plano_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE plano_servico FORCE ROW LEVEL SECURITY;
CREATE POLICY plano_servico_da_loja ON plano_servico
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON plano_servico TO agendz_app;

ALTER TABLE assinatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura FORCE ROW LEVEL SECURITY;
CREATE POLICY assinatura_da_loja ON assinatura
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON assinatura TO agendz_app;

ALTER TABLE assinatura_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_pagamento FORCE ROW LEVEL SECURITY;
CREATE POLICY assinatura_pagamento_da_loja ON assinatura_pagamento
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON assinatura_pagamento TO agendz_app;

ALTER TABLE assinatura_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_evento FORCE ROW LEVEL SECURITY;
CREATE POLICY assinatura_evento_da_loja ON assinatura_evento
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON assinatura_evento TO agendz_app;
GRANT USAGE, SELECT ON SEQUENCE assinatura_evento_id_seq TO agendz_app;

ALTER TABLE pedido_plano ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_plano FORCE ROW LEVEL SECURITY;
CREATE POLICY pedido_plano_da_loja ON pedido_plano
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON pedido_plano TO agendz_app;
