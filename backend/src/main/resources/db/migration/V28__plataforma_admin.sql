-- A3 (Admin da plataforma): situação da loja (suspensa = 402 nas rotas da loja), regras que o Admin define por cliente e último acesso dos usuários.
-- A situação e as regras são da PLATAFORMA (sem RLS, como `loja`): só o Admin, pela rota interna com chave, escreve; a loja só lê.
ALTER TABLE loja ADD COLUMN status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('em_teste', 'ativo', 'em_atraso', 'suspenso', 'encerrado'));
ALTER TABLE loja ADD COLUMN status_em timestamptz;

CREATE TABLE loja_regra_plataforma (
  loja_id               uuid PRIMARY KEY REFERENCES loja (id) ON DELETE CASCADE,
  limite_agendas        integer CHECK (limite_agendas BETWEEN 1 AND 1000),
  limite_usuarios       integer CHECK (limite_usuarios BETWEEN 1 AND 1000),
  mensagens_ativas      boolean NOT NULL DEFAULT true,
  limite_mensagens_mes  integer CHECK (limite_mensagens_mes BETWEEN 0 AND 1000000),
  cadastro_obrigatorios text NOT NULL DEFAULT '' CHECK (cadastro_obrigatorios IN ('', 'cpf', 'nascimento', 'cpf,nascimento')),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON loja_regra_plataforma TO agendz_app;

ALTER TABLE usuario ADD COLUMN ultimo_acesso timestamptz;
