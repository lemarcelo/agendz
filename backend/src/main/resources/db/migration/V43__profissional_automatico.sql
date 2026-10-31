-- B9c: o proprietário pode tirar o campo "quem vai fazer o serviço". Ligado, o servidor escolhe o profissional que atende naquele horário e está com a agenda
-- mais livre (menos agendamentos no dia; empate: menos nos 7 dias seguintes; depois a ordem da equipe). Só uma marcação sim/não; padrão: continua perguntando.
ALTER TABLE configuracao_loja ADD COLUMN profissional_automatico boolean NOT NULL DEFAULT false;
