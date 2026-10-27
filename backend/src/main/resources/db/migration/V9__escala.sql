-- Expediente da loja e escala dos profissionais (faixas por dia da semana). usuario_id NULL = expediente da LOJA; preenchido = escala do profissional.
-- Minutos desde 00:00 (0 a 1440): sem fuso e sem tipo `time` (o fuso entra só na conta, em Java: America/Sao_Paulo).
-- Sem nenhuma faixa da loja = expediente ainda não cadastrado: a agenda não restringe (lojas novas e testes). Profissional sem faixa própria segue a loja.
CREATE TABLE escala_faixa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES loja (id),
  usuario_id  uuid,
  dia         smallint NOT NULL CHECK (dia BETWEEN 0 AND 6),        -- 0 = domingo
  ini_min     smallint NOT NULL CHECK (ini_min BETWEEN 0 AND 1439),
  fim_min     smallint NOT NULL CHECK (fim_min BETWEEN 1 AND 1440),
  CHECK (ini_min < fim_min),
  FOREIGN KEY (loja_id, usuario_id) REFERENCES usuario (loja_id, id)  -- composta: com usuario_id nulo (expediente da loja) não é conferida
);
CREATE INDEX escala_faixa_busca ON escala_faixa (loja_id, usuario_id, dia, ini_min);

ALTER TABLE escala_faixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE escala_faixa FORCE ROW LEVEL SECURITY;
CREATE POLICY escala_faixa_da_loja ON escala_faixa
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON escala_faixa TO agendz_app;

-- O assistente de primeiro acesso ganha o passo "expediente" (depois da equipe).
ALTER TABLE onboarding DROP CONSTRAINT IF EXISTS onboarding_passo_check;
ALTER TABLE onboarding ADD CONSTRAINT onboarding_passo_valido CHECK (passo IN ('senha', 'servicos', 'equipe', 'expediente', 'pronto'));
