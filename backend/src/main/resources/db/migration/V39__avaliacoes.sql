-- Avaliações do atendimento e mensagens em lote (v118, F5 fase 2; spec docs/F5-avaliacoes.md).
-- Só atendimento CONCLUÍDO é avaliado, uma avaliação por agendamento; ninguém edita nem apaga (o dono OCULTA com motivo: sai da média, o registro fica).
-- O cliente chega por um token pessoal por agendamento: só o HASH (SHA-256) fica aqui, vale 90 dias, uso único, um token vivo por agendamento.
-- Toda tabela tem loja_id + RLS e chaves estrangeiras COMPOSTAS (loja_id, id): o banco recusa id de outra loja mesmo que um bug o passasse.

ALTER TABLE cliente ADD COLUMN sem_mensagens boolean NOT NULL DEFAULT false;   -- pediu para não receber mensagens (fica fora da fila em lote e da estrela)

ALTER TABLE agendamento
  ADD COLUMN avaliacao_pedida_em  timestamptz,
  ADD COLUMN avaliacao_pedida_por uuid;   -- só visual: "pedida em dd/mm"; pedir de novo é permitido

-- Regra da plataforma (só o Admin escreve, pela rota interna): falso = o painel da loja NÃO recebe nome nem cadastro de quem avaliou como anônimo.
ALTER TABLE loja_regra_plataforma ADD COLUMN avaliacao_mostra_anonimo boolean NOT NULL DEFAULT false;

CREATE TABLE avaliacao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja (id),
  agendamento_id  uuid NOT NULL,
  cliente_id      uuid,
  profissional_id uuid,
  nota            smallint NOT NULL CHECK (nota BETWEEN 1 AND 5),
  texto           text NOT NULL DEFAULT '' CHECK (char_length(texto) <= 500),
  anonimo         boolean NOT NULL DEFAULT false,
  em              timestamptz NOT NULL,
  oculta          boolean NOT NULL DEFAULT false,
  motivo_oculta   text CHECK (motivo_oculta IS NULL OR char_length(motivo_oculta) BETWEEN 5 AND 200),
  oculta_em       timestamptz,
  UNIQUE (loja_id, id),
  UNIQUE (loja_id, agendamento_id),   -- uma avaliação por agendamento: o banco garante mesmo com dois envios ao mesmo tempo
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, cliente_id) REFERENCES cliente (loja_id, id),
  FOREIGN KEY (loja_id, profissional_id) REFERENCES usuario (loja_id, id)
);
CREATE INDEX avaliacao_em ON avaliacao (loja_id, em DESC);
CREATE INDEX avaliacao_profissional ON avaliacao (loja_id, profissional_id, em DESC);

-- Serviços avaliados (os do atendimento, na ordem em que foram marcados): a avaliação vale para todos eles e para o profissional.
CREATE TABLE avaliacao_servico (
  loja_id      uuid NOT NULL REFERENCES loja (id),
  avaliacao_id uuid NOT NULL,
  servico_id   uuid NOT NULL,
  ordem        smallint NOT NULL,
  PRIMARY KEY (avaliacao_id, servico_id),
  FOREIGN KEY (loja_id, avaliacao_id) REFERENCES avaliacao (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, servico_id) REFERENCES servico (loja_id, id)
);
CREATE INDEX avaliacao_servico_servico ON avaliacao_servico (loja_id, servico_id);

-- Histórico de ocultar/reexibir (quem, quando, motivo). Nunca apaga.
CREATE TABLE avaliacao_evento (
  id           bigserial PRIMARY KEY,
  loja_id      uuid NOT NULL REFERENCES loja (id),
  avaliacao_id uuid NOT NULL,
  em           timestamptz NOT NULL,
  autor_id     uuid,
  acao         text NOT NULL CHECK (acao IN ('ocultou', 'reexibiu')),
  motivo       text NOT NULL CHECK (char_length(motivo) BETWEEN 5 AND 200),
  FOREIGN KEY (loja_id, avaliacao_id) REFERENCES avaliacao (loja_id, id) ON DELETE CASCADE
);

-- Acesso do cliente: só o hash do token. Um token VIVO (não usado) por agendamento; pedir de novo troca o anterior.
CREATE TABLE avaliacao_acesso (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id        uuid NOT NULL REFERENCES loja (id),
  agendamento_id uuid NOT NULL,
  token_hash     text NOT NULL,
  criado_em      timestamptz NOT NULL,
  expira_em      timestamptz NOT NULL,
  usado_em       timestamptz,
  UNIQUE (token_hash),
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX avaliacao_acesso_vivo ON avaliacao_acesso (loja_id, agendamento_id) WHERE usado_em IS NULL;

-- Fila de mensagens em lote (WhatsApp, um clique por pessoa; sem a API da Meta não existe envio automático). Uma fila aberta por pessoa.
CREATE TABLE fila_mensagem (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja (id),
  tipo            text NOT NULL CHECK (tipo IN ('avaliacao', 'aviso')),
  criada_em       timestamptz NOT NULL,
  criada_por      uuid NOT NULL,
  de              date NOT NULL,
  ate             date NOT NULL,
  profissional_id uuid,
  servico_id      uuid,
  modelo          text NOT NULL CHECK (char_length(modelo) BETWEEN 5 AND 300),
  encerrada       boolean NOT NULL DEFAULT false,
  contagem        jsonb NOT NULL,
  UNIQUE (loja_id, id),
  FOREIGN KEY (loja_id, criada_por) REFERENCES usuario (loja_id, id)
);
CREATE UNIQUE INDEX fila_mensagem_aberta_por_pessoa ON fila_mensagem (loja_id, criada_por) WHERE NOT encerrada;

CREATE TABLE fila_mensagem_item (
  loja_id             uuid NOT NULL REFERENCES loja (id),
  fila_id             uuid NOT NULL,
  ordem               integer NOT NULL,
  agendamento_id      uuid NOT NULL,
  nome                text NOT NULL,
  telefone_mascarado  text NOT NULL,
  servicos            jsonb NOT NULL,
  inicio              timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aberto', 'enviado', 'pulou')),
  em                  timestamptz,
  motivo              text,
  PRIMARY KEY (fila_id, ordem),
  FOREIGN KEY (loja_id, fila_id) REFERENCES fila_mensagem (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE
);

ALTER TABLE avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacao FORCE ROW LEVEL SECURITY;
CREATE POLICY avaliacao_da_loja ON avaliacao
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON avaliacao TO agendz_app;

ALTER TABLE avaliacao_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacao_servico FORCE ROW LEVEL SECURITY;
CREATE POLICY avaliacao_servico_da_loja ON avaliacao_servico
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON avaliacao_servico TO agendz_app;

ALTER TABLE avaliacao_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacao_evento FORCE ROW LEVEL SECURITY;
CREATE POLICY avaliacao_evento_da_loja ON avaliacao_evento
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON avaliacao_evento TO agendz_app;
GRANT USAGE, SELECT ON SEQUENCE avaliacao_evento_id_seq TO agendz_app;

ALTER TABLE avaliacao_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacao_acesso FORCE ROW LEVEL SECURITY;
CREATE POLICY avaliacao_acesso_da_loja ON avaliacao_acesso
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON avaliacao_acesso TO agendz_app;

ALTER TABLE fila_mensagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE fila_mensagem FORCE ROW LEVEL SECURITY;
CREATE POLICY fila_mensagem_da_loja ON fila_mensagem
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON fila_mensagem TO agendz_app;

ALTER TABLE fila_mensagem_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE fila_mensagem_item FORCE ROW LEVEL SECURITY;
CREATE POLICY fila_mensagem_item_da_loja ON fila_mensagem_item
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON fila_mensagem_item TO agendz_app;
