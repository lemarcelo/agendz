-- Equipe completa (F2 parte 4): os quatro perfis da API simulada e o cadastro da pessoa.
-- Dados pessoais cifrados (docs/MAPA-DADOS-PESSOAIS.md): CPF, e-mail, telefone e nascimento em `*_cif` (AES-256-GCM); CPF e e-mail também em hash (HMAC com pepper
-- amarrado à loja) só para impedir duplicidade. Nome e apelido ficam em texto puro. A foto é dado opcional (data URL conferido pelos primeiros bytes no servidor).
ALTER TABLE usuario DROP CONSTRAINT usuario_papel_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_papel_check CHECK (papel IN ('dono', 'admin', 'atendente', 'profissional'));

ALTER TABLE usuario
  ADD COLUMN apelido         text CHECK (apelido IS NULL OR char_length(apelido) BETWEEN 1 AND 60),
  ADD COLUMN email_cif       text,
  ADD COLUMN email_hash      text,
  ADD COLUMN telefone_cif    text,
  ADD COLUMN cpf_cif         text,
  ADD COLUMN cpf_hash        text,
  ADD COLUMN nascimento_cif  text,
  ADD COLUMN foto            text CHECK (foto IS NULL OR char_length(foto) <= 30000),
  ADD COLUMN comissao_pct    numeric(5,2) CHECK (comissao_pct IS NULL OR comissao_pct BETWEEN 0 AND 100),
  ADD COLUMN pode_vender     boolean NOT NULL DEFAULT true,
  ADD COLUMN permissoes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN cor_slot        integer CHECK (cor_slot IS NULL OR cor_slot BETWEEN 0 AND 35);

CREATE UNIQUE INDEX usuario_cpf_unico ON usuario (loja_id, cpf_hash) WHERE cpf_hash IS NOT NULL;
CREATE UNIQUE INDEX usuario_email_unico ON usuario (loja_id, email_hash) WHERE email_hash IS NOT NULL;
CREATE UNIQUE INDEX usuario_apelido_unico ON usuario (loja_id, lower(apelido)) WHERE apelido IS NOT NULL;
