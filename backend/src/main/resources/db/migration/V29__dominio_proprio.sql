-- A5: domínio próprio da loja com prova por TXT no DNS. O servidor gera um token por domínio; a loja publica
-- `_agendz-verificacao.<host> TXT "agendz-verificacao=<token>"` e só então `verificado` vira true (o Caddy só emite certificado para verificado).
ALTER TABLE loja_dominio ADD COLUMN token text;
ALTER TABLE loja_dominio ADD COLUMN verificado_em timestamptz;
