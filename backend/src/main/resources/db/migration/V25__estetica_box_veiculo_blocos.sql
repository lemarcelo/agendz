-- Estética no servidor: boxes (recurso físico que o carro ocupa), veículo/porte congelados no agendamento e blocos de trabalho (serviço de vários dias).
-- Box só existe nos tipos com a capacidade usaRecursoFisico; nos outros as colunas ficam nulas.
CREATE TABLE box (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id   uuid NOT NULL REFERENCES loja (id),
  nome      text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 30),
  ativo     boolean NOT NULL DEFAULT true,
  ordem     integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, id)
);
CREATE UNIQUE INDEX box_nome_unico ON box (loja_id, lower(btrim(nome)));
ALTER TABLE box ENABLE ROW LEVEL SECURITY;
ALTER TABLE box FORCE ROW LEVEL SECURITY;
CREATE POLICY box_da_loja ON box
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON box TO agendz_app;

-- O agendamento guarda o box, o veículo (id do cadastro, se ainda existir) e uma "foto" do veículo e do porte (o cadastro pode mudar depois; o combinado não).
ALTER TABLE agendamento
  ADD COLUMN box_id         uuid,
  ADD COLUMN veiculo_id     uuid,
  ADD COLUMN porte          text CHECK (porte IN ('pequeno', 'medio', 'grande', 'suv', 'pickup')),
  ADD COLUMN veiculo_placa  text CHECK (char_length(veiculo_placa) <= 8),
  ADD COLUMN veiculo_marca  text CHECK (char_length(veiculo_marca) <= 30),
  ADD COLUMN veiculo_modelo text CHECK (char_length(veiculo_modelo) <= 40),
  ADD COLUMN veiculo_cor    text CHECK (char_length(veiculo_cor) <= 20);
ALTER TABLE agendamento ADD CONSTRAINT agendamento_box_fk FOREIGN KEY (loja_id, box_id) REFERENCES box (loja_id, id);
-- Veículo removido do cadastro (sem agendamento futuro ativo) some só do vínculo; a foto continua no agendamento.
ALTER TABLE agendamento ADD CONSTRAINT agendamento_veiculo_fk FOREIGN KEY (loja_id, veiculo_id) REFERENCES cliente_veiculo (loja_id, id) ON DELETE SET NULL (veiculo_id);
CREATE INDEX agendamento_box_inicio ON agendamento (loja_id, box_id, inicio) WHERE box_id IS NOT NULL;

-- Blocos em que o profissional está trabalhando no atendimento (o último inclui o intervalo depois do serviço). Serviço comum = 1 bloco [inicio, fim_ocupado];
-- serviço de vários dias = um bloco por dia de expediente. A sobreposição do profissional é conferida aqui.
CREATE TABLE agendamento_bloco (
  loja_id        uuid NOT NULL REFERENCES loja (id),
  agendamento_id uuid NOT NULL,
  ini            timestamptz NOT NULL,
  fim            timestamptz NOT NULL,
  PRIMARY KEY (agendamento_id, ini),
  CHECK (ini < fim),
  FOREIGN KEY (loja_id, agendamento_id) REFERENCES agendamento (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX agendamento_bloco_periodo ON agendamento_bloco (loja_id, ini, fim);
ALTER TABLE agendamento_bloco ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_bloco FORCE ROW LEVEL SECURITY;
CREATE POLICY agendamento_bloco_da_loja ON agendamento_bloco
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON agendamento_bloco TO agendz_app;

-- Agendamentos que já existiam: um bloco só, igual ao que a conferência usava até aqui.
INSERT INTO agendamento_bloco (loja_id, agendamento_id, ini, fim) SELECT loja_id, id, inicio, fim_ocupado FROM agendamento;

-- Todo agendamento nasce com 1 bloco [inicio, fim_ocupado]; quem calcula blocos de vários dias (a API) troca por os dele. Assim nenhum caminho de gravação fica sem ocupação.
CREATE FUNCTION agendamento_bloco_padrao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO agendamento_bloco (loja_id, agendamento_id, ini, fim) VALUES (NEW.loja_id, NEW.id, NEW.inicio, NEW.fim_ocupado);
  RETURN NEW;
END $$;
CREATE TRIGGER agendamento_bloco_padrao AFTER INSERT ON agendamento FOR EACH ROW EXECUTE FUNCTION agendamento_bloco_padrao();
