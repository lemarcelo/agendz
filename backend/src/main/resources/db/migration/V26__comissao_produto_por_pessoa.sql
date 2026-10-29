-- Comissão sobre produtos por pessoa (pedido do Marcelo, v102): definida na equipe, junto da comissão sobre serviços.
-- Na venda, o percentual congelado na linha é o do próprio produto (se tem) e, senão, o desta coluna do vendedor; vazio = sem comissão sobre produtos.
ALTER TABLE usuario ADD COLUMN comissao_produto_pct numeric(5,2) CHECK (comissao_produto_pct IS NULL OR (comissao_produto_pct >= 0 AND comissao_produto_pct <= 100));
