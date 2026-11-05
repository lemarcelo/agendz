# Homologação Agendz — preparação

Esta é uma configuração proposta e ainda não implantada nem validada na VPS. Ela cria dois bancos, APIs e um gateway próprios. O gateway é o único serviço que participa também da rede existente agendz_default, para que o Caddy de entrada consiga encaminhar os domínios. Nenhuma porta de banco ou API é publicada.

- Domínios solicitados: h-estetica.agendz.io, h-barbearia.agendz.io e h-admin.agendz.io. Criar as lojas h-estetica e h-barbearia somente no banco de homologação, com dados fictícios.
- Arquivos, segredos, volumes e credenciais devem ser exclusivos de homologação; não copie bancos, chaves ou dados reais. VAPID e reCAPTCHA ficam vazios nesta proposta. Revisar e desativar outras integrações e envios reais antes do primeiro uso.
- Informar H_AGENDZ_IMAGE e H_ADMIN_IMAGE como imagens específicas da versão candidata, preferencialmente por digest; nunca reutilizar latest. O Admin atualmente é carregado por SSH: adaptar o processo para etiquetar e transferir a imagem candidata sem sobrescrever a de produção.
- Gerar o site real com AGENDZ_DOMINIO=agendz.io a partir da versão candidata e disponibilizar o conteúdo estático em ./site; conferir site, service worker e caminhos dos ativos. Guardar os identificadores das versões de ambos os repositórios e do front-end.
- Antes de publicar, verificar DNS e capacidade da VPS, configurações de rede, segredos, integridade do certificado, autorização de acesso, migrações, testes de isolamento e ausência de efeitos externos. Validar Caddy e Compose em ambiente seguro. O exemplo Caddyfile-proxy.exemplo requer revisão e alteração coordenada do Caddy que atende produção.
- Os workflows atuais publicam produção ao enviar para main. Criar e testar fluxos de homologação e promoção separados antes de usar; estes arquivos não alteram os workflows existentes nem fazem deploy.
- Para novos tipos, adicionar lojas e domínios por configuração e revisar regras específicas, sem duplicar a aplicação por tipo.

- A rede interna da homologação bloqueia a saída direta das APIs e bancos para a internet. Isso impede integrações externas e também significa que recursos que dependam delas não funcionarão até existir uma liberação controlada. O gateway participa da rede de entrada apenas para receber as requisições; validar o isolamento efetivo na VPS antes de liberar o acesso.

- O encadeamento dos dois Caddy precisa preservar com segurança o IP real do cliente: as APIs usam X-Forwarded-For para controles de acesso e auditoria. Validar o comportamento e a confiança no proxy de entrada antes de publicar; não confiar cegamente em cabeçalhos enviados pelo navegador.

- H_PROXY_CIDR deve conter somente a sub-rede da rede Docker em que está o Caddy de entrada, confirmada por inspeção no momento do deploy. O gateway confia nos cabeçalhos encaminhados por essa sub-rede; todos os serviços com acesso a ela fazem parte desse limite de confiança. Validar IP real e tentativas de forjar cabeçalhos antes de abrir a homologação.

- Na pasta própria de homologação, o script preparar-homologacao.sh pode criar o .env privado a partir de duas imagens fixadas por digest ou commit completo; ele não inicia serviços e não substitui credenciais existentes. Confira o valor de H_PROXY_CIDR e a rede antes de usar. Nunca copie o .env de produção.
