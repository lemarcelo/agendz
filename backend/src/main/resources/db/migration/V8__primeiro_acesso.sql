-- Primeiro acesso: senha temporária (troca obrigatória) e andamento do assistente de início.
ALTER TABLE usuario ADD COLUMN deve_trocar_senha boolean NOT NULL DEFAULT false;

-- Uma linha por loja que ainda precisa (ou precisou) do assistente. Sem linha = não se aplica (lojas antigas e de desenvolvimento).
-- Pendente = existe linha e concluido_em é nulo. O script deploy/provisionar-loja.sh cria a linha junto com o dono.
CREATE TABLE onboarding (
  loja_id       uuid PRIMARY KEY REFERENCES loja (id),
  passo         text NOT NULL DEFAULT 'senha' CHECK (passo IN ('senha', 'servicos', 'equipe', 'pronto')),
  concluido_em  timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_da_loja ON onboarding
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding TO agendz_app;
