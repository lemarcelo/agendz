-- Logo e tema da loja, editáveis pelo proprietário em Estabelecimento (site real). As colunas logo/tema_cor/tema_cor2 já existem na tabela da plataforma `loja`
-- (V1/V3), que NÃO tem RLS e só dá SELECT ao papel agendz_app. Em vez de abrir UPDATE na tabela inteira, a gravação passa por esta função: ela roda com os
-- direitos do dono do esquema, mas só mexe na linha da loja da sessão (`app.loja_id`), nas três colunas da marca. Sem loja na sessão, não grava nada.
-- As cores são #rrggbb (NOT VALID: vale para o que for gravado daqui em diante; não reprova linha antiga cadastrada pelo Admin).
ALTER TABLE loja ADD CONSTRAINT loja_tema_cor_valida CHECK (tema_cor IS NULL OR tema_cor ~ '^#[0-9a-fA-F]{6}$') NOT VALID;
ALTER TABLE loja ADD CONSTRAINT loja_tema_cor2_valida CHECK (tema_cor2 IS NULL OR tema_cor2 ~ '^#[0-9a-fA-F]{6}$') NOT VALID;

CREATE OR REPLACE FUNCTION loja_gravar_marca(p_logo text, p_tema_cor text, p_tema_cor2 text) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH g AS (
    UPDATE loja SET logo = p_logo, tema_cor = p_tema_cor, tema_cor2 = p_tema_cor2
     WHERE id = nullif(current_setting('app.loja_id', true), '')::uuid
    RETURNING 1)
  SELECT count(*)::integer FROM g
$$;
REVOKE ALL ON FUNCTION loja_gravar_marca(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION loja_gravar_marca(text, text, text) TO agendz_app;
