-- Suporte ao tipo 'fraude' em aviso_painel e motivo 'fraude' em link_barrado
ALTER TABLE aviso_painel DROP CONSTRAINT IF EXISTS aviso_painel_tipo_check;
ALTER TABLE aviso_painel ADD CONSTRAINT aviso_painel_tipo_check CHECK (tipo IN ('pedido', 'remarcou', 'cancelou', 'fixo', 'fraude'));

ALTER TABLE link_barrado DROP CONSTRAINT IF EXISTS link_barrado_motivo_check;
ALTER TABLE link_barrado ADD CONSTRAINT link_barrado_motivo_check CHECK (motivo IN ('limite_cliente','isca','rapido','selo_invalido','frequencia','captcha','fraude'));
