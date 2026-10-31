-- Horários fixos do assinante de um plano (v128; espelho de `definirFixos`/`materializarFixos` em src/domain/assinaturas.js).
-- Até 3 por assinatura: dia da semana (0 = domingo) + hora + profissional + serviços do plano (+ veículo nos tipos com veículo). A automação do minuto cria o agendamento
-- de cada um 14 dias à frente, sem duplicar: o par (fixo_id, fixo_data) é único no banco, então dois minutos seguidos (ou duas instâncias) nunca criam o mesmo dia duas vezes,
-- mesmo que o primeiro agendamento tenha sido cancelado de propósito. Toda tabela tem loja_id + RLS.

CREATE TABLE assinatura_fixo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id         uuid NOT NULL REFERENCES loja (id),
  assinatura_id   uuid NOT NULL,
  dia             smallint NOT NULL CHECK (dia BETWEEN 0 AND 6),
  hm              text NOT NULL CHECK (hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  profissional_id uuid NOT NULL REFERENCES usuario (id),
  servicos        text NOT NULL CHECK (char_length(servicos) BETWEEN 36 AND 400),   -- ids separados por vírgula (de 1 a 10)
  veiculo_id      uuid,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loja_id, id),
  UNIQUE (assinatura_id, dia, hm),
  FOREIGN KEY (loja_id, assinatura_id) REFERENCES assinatura (loja_id, id) ON DELETE CASCADE
);
CREATE INDEX assinatura_fixo_profissional ON assinatura_fixo (loja_id, profissional_id);

ALTER TABLE assinatura_fixo ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_fixo FORCE ROW LEVEL SECURITY;
CREATE POLICY assinatura_fixo_da_loja ON assinatura_fixo
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON assinatura_fixo TO agendz_app;

-- Sem FK para o fixo: apagar o fixo não pode apagar nem soltar os agendamentos já feitos (os que ainda não aconteceram saem pela regra, em código).
ALTER TABLE agendamento ADD COLUMN fixo_id uuid, ADD COLUMN fixo_data date;
CREATE UNIQUE INDEX agendamento_fixo_no_dia ON agendamento (fixo_id, fixo_data) WHERE fixo_id IS NOT NULL;

-- Avisos de "o horário fixo não foi criado" (ocupado por outro, sem atendimento ou sem mensalidade): um por ocorrência, nunca repetido a cada minuto.
ALTER TABLE aviso_painel DROP CONSTRAINT aviso_painel_tipo_check;
ALTER TABLE aviso_painel ADD CONSTRAINT aviso_painel_tipo_check CHECK (tipo IN ('pedido', 'remarcou', 'cancelou', 'fixo'));

CREATE TABLE assinatura_fixo_aviso (
  loja_id       uuid NOT NULL REFERENCES loja (id),
  assinatura_id uuid NOT NULL,
  chave         text NOT NULL CHECK (char_length(chave) BETWEEN 1 AND 80),   -- fixoId:aaaa-mm-dd
  criado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assinatura_id, chave),
  FOREIGN KEY (loja_id, assinatura_id) REFERENCES assinatura (loja_id, id) ON DELETE CASCADE
);

ALTER TABLE assinatura_fixo_aviso ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_fixo_aviso FORCE ROW LEVEL SECURITY;
CREATE POLICY assinatura_fixo_aviso_da_loja ON assinatura_fixo_aviso
  USING      (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid)
  WITH CHECK (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON assinatura_fixo_aviso TO agendz_app;

-- Fixo retirado do plano com cobrança ou produto já lançado no agendamento: em vez de apagar, cancela (o atendimento do plano volta do mesmo jeito).
ALTER TABLE agendamento DROP CONSTRAINT agendamento_motivo_cancelamento_check;
ALTER TABLE agendamento ADD CONSTRAINT agendamento_motivo_cancelamento_check CHECK (motivo_cancelamento IN ('profissional', 'cliente', 'conflito', 'falta_confirmacao', 'plano_fixo'));
