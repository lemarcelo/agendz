-- B4: o registro de pedidos barrados ganha o motivo 'captcha' (o autoatendimento pediu a prova do reCAPTCHA e ela faltou ou falhou).
ALTER TABLE link_barrado DROP CONSTRAINT IF EXISTS link_barrado_motivo_check;
ALTER TABLE link_barrado ADD CONSTRAINT link_barrado_motivo_check CHECK (motivo IN ('limite_cliente','isca','rapido','selo_invalido','frequencia','captcha'));
