-- V55 (bloco A): serviços por funcionário e ausência do profissional.
-- Decisão sem confirmação: quem realiza cada serviço é uma tabela de vínculo (profissional × serviço) com a mesma trava dupla das outras (loja_id NOT NULL + RLS).
-- Padrão ao cadastrar: serviço novo vem com TODOS os profissionais e profissional novo vem com TODOS os serviços (gatilhos abaixo cobrem todo caminho de gravação:
-- Serviços, Equipe, primeiro acesso, Reconfigurar, catálogo). Os vínculos que já valiam de fato (todo mundo fazia tudo) são criados aqui para preservar o comportamento.

CREATE TABLE profissional_servico (
  loja_id     uuid NOT NULL REFERENCES loja (id),
  usuario_id  uuid NOT NULL,
  servico_id  uuid NOT NULL,
  PRIMARY KEY (usuario_id, servico_id),
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id) ON DELETE CASCADE,
  FOREIGN KEY (loja_id, servico_id) REFERENCES servico (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX profissional_servico_servico ON profissional_servico (loja_id, servico_id);

-- Vínculos que já valiam (preenche antes de ligar o RLS: a migração roda sem `app.loja_id`).
INSERT INTO profissional_servico (loja_id, usuario_id, servico_id)
SELECT u.loja_id, u.id, s.id FROM usuario u JOIN servico s ON s.loja_id = u.loja_id;

ALTER TABLE profissional_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE profissional_servico FORCE ROW LEVEL SECURITY;
CREATE POLICY profissional_servico_da_loja ON profissional_servico
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON profissional_servico TO agendz_app;

-- Serviço novo: todos os usuários da loja o realizam (a tela depois desmarca quem não faz).
CREATE FUNCTION servico_vinculo_padrao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profissional_servico (loja_id, usuario_id, servico_id)
  SELECT NEW.loja_id, u.id, NEW.id FROM usuario u WHERE u.loja_id = NEW.loja_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER servico_vinculo_padrao AFTER INSERT ON servico FOR EACH ROW EXECUTE FUNCTION servico_vinculo_padrao();

-- Usuário novo: realiza todos os serviços da loja.
CREATE FUNCTION usuario_vinculo_padrao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profissional_servico (loja_id, usuario_id, servico_id)
  SELECT NEW.loja_id, NEW.id, s.id FROM servico s WHERE s.loja_id = NEW.loja_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER usuario_vinculo_padrao AFTER INSERT ON usuario FOR EACH ROW EXECUTE FUNCTION usuario_vinculo_padrao();

-- Ausência: intervalo em que o profissional NÃO pode receber agendamento (horários específicos ou dias inteiros). Um intervalo por linha.
CREATE TABLE ausencia (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES loja (id),
  usuario_id  uuid NOT NULL,
  ini         timestamptz NOT NULL,
  fim         timestamptz NOT NULL,
  dia_inteiro boolean NOT NULL DEFAULT false,
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CHECK (ini < fim),
  CHECK (fim - ini <= interval '31 days'),
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX ausencia_busca ON ausencia (loja_id, usuario_id, ini, fim);

ALTER TABLE ausencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE ausencia FORCE ROW LEVEL SECURITY;
CREATE POLICY ausencia_da_loja ON ausencia
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON ausencia TO agendz_app;
