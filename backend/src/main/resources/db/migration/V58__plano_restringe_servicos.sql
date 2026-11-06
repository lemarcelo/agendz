-- E2: o plano pode RESTRINGIR o agendamento pelo link aos serviços que ele inclui (cliente com plano ativo só agenda sozinho o que o plano cobre;
-- a equipe agenda qualquer serviço pelo painel). Padrão false: nada muda para os planos que já existem. A cópia do plano que a assinatura guarda
-- (assinatura.plano_foto) ganha a mesma chave `restringeServicos` ao contratar; foto antiga sem a chave vale false.
ALTER TABLE plano ADD COLUMN restringe_servicos boolean NOT NULL DEFAULT false;
