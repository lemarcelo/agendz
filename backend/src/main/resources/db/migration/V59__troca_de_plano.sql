-- E3: troca de plano pagando só a diferença.
-- Configuração da loja (desconto sobre a diferença e WhatsApp para o pedido); pedido de troca no mesmo pedido_plano do link; a assinatura que nasce da troca
-- guarda de qual veio e quanto vale o primeiro mês (a diferença). A linha de configuracao_loja pode não existir (loja nova): quem lê usa coalesce.
ALTER TABLE configuracao_loja
  ADD COLUMN plano_desconto_troca_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (plano_desconto_troca_pct BETWEEN 0 AND 100),
  ADD COLUMN plano_whatsapp           text CHECK (plano_whatsapp IS NULL OR plano_whatsapp ~ '^[0-9]{12,13}$');   -- 55 + DDD + número

ALTER TABLE pedido_plano
  ADD COLUMN tipo            text NOT NULL DEFAULT 'novo' CHECK (tipo IN ('novo', 'troca')),
  ADD COLUMN de_assinatura_id uuid,
  ADD COLUMN valor_diferenca numeric(10,2) CHECK (valor_diferenca IS NULL OR (valor_diferenca >= 0 AND valor_diferenca <= 99999)),
  ADD COLUMN desconto_pct    numeric(5,2),
  ADD CONSTRAINT pedido_plano_de_assinatura_fk FOREIGN KEY (loja_id, de_assinatura_id) REFERENCES assinatura (loja_id, id);

-- O mesmo telefone pedindo a mesma coisa duas vezes não duplica; pedir o plano novo e pedir a troca para ele são pedidos diferentes.
DROP INDEX pedido_plano_aberto_unico;
CREATE UNIQUE INDEX pedido_plano_aberto_unico ON pedido_plano (loja_id, telefone_hash, plano_id, tipo) WHERE status = 'novo';

ALTER TABLE assinatura
  ADD COLUMN troca_de_id        uuid,
  ADD COLUMN valor_primeiro_mes numeric(10,2) CHECK (valor_primeiro_mes IS NULL OR (valor_primeiro_mes >= 0 AND valor_primeiro_mes <= 99999)),
  ADD CONSTRAINT assinatura_troca_de_fk FOREIGN KEY (loja_id, troca_de_id) REFERENCES assinatura (loja_id, id);

-- Com 100% de desconto a diferença pode ser zero: a mensalidade do mês da troca passa a aceitar 0 (o resto continua > 0 pelo plano).
DO $$
DECLARE nome text;
BEGIN
  SELECT conname INTO nome FROM pg_constraint
   WHERE conrelid = 'assinatura_pagamento'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(valor >%';
  IF nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE assinatura_pagamento DROP CONSTRAINT %I', nome);
  END IF;
END $$;
ALTER TABLE assinatura_pagamento ADD CONSTRAINT assinatura_pagamento_valor_ck CHECK (valor >= 0 AND valor <= 99999);
