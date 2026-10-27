-- Agenda (núcleo): agendamento + serviços congelados no momento da marcação. Mesma trava dupla: loja_id NOT NULL + RLS.
-- As chaves estrangeiras são COMPOSTAS (loja_id, id): mesmo que um bug passasse o id de outra loja, o banco recusa (FK não enxerga RLS).
ALTER TABLE servico ADD COLUMN intervalo_min integer NOT NULL DEFAULT 0 CHECK (intervalo_min BETWEEN 0 AND 600);  -- folga depois do serviço (limpeza, troca de box)

ALTER TABLE cliente ADD CONSTRAINT cliente_loja_id_uq UNIQUE (loja_id, id);
ALTER TABLE usuario ADD CONSTRAINT usuario_loja_id_uq UNIQUE (loja_id, id);
ALTER TABLE servico ADD CONSTRAINT servico_loja_id_uq UNIQUE (loja_id, id);

CREATE TABLE agendamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja (id),
  cliente_id      uuid NOT NULL,
  profissional_id uuid NOT NULL,
  inicio          timestamptz NOT NULL,
  fim_servico     timestamptz NOT NULL,   -- quando o serviço termina (retirada)
  fim_ocupado     timestamptz NOT NULL,   -- fim_servico + intervalo do último serviço: até aqui o profissional está ocupado
  status          text NOT NULL CHECK (status IN ('a_confirmar', 'confirmado', 'concluido', 'cancelado')),
  encaixe         boolean NOT NULL DEFAULT false,
  total           numeric(10,2) NOT NULL CHECK (total >= 0 AND total <= 1000000),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CHECK (inicio < fim_servico AND fim_servico <= fim_ocupado),
  UNIQUE (loja_id, id),
  FOREIGN KEY (loja_id, cliente_id) REFERENCES cliente (loja_id, id),
  FOREIGN KEY (loja_id, profissional_id) REFERENCES usuario (loja_id, id)
);
CREATE INDEX agendamento_profissional_inicio ON agendamento (loja_id, profissional_id, inicio);
CREATE INDEX agendamento_inicio ON agendamento (loja_id, inicio);

CREATE TABLE agendamento_servico (
  loja_id         uuid NOT NULL REFERENCES loja (id),
  agendamento_id  uuid NOT NULL,
  servico_id      uuid NOT NULL,
  ordem           smallint NOT NULL,
  nome            text NOT NULL,           -- congelados: mudar o serviço depois não muda o que já foi marcado
  preco           numeric(10,2) NOT NULL,
  duracao_min     integer NOT NULL,
  intervalo_min   integer NOT NULL,
  PRIMARY KEY (agendamento_id, servico_id),
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, servico_id) REFERENCES servico (loja_id, id)
);

ALTER TABLE agendamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento FORCE ROW LEVEL SECURITY;
CREATE POLICY agendamento_da_loja ON agendamento
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

ALTER TABLE agendamento_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_servico FORCE ROW LEVEL SECURITY;
CREATE POLICY agendamento_servico_da_loja ON agendamento_servico
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON agendamento, agendamento_servico TO agendz_app;
