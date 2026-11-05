# Homologação Agendz — preparação

A primeira instalação está na VPS, com dois bancos, APIs e um gateway próprios. Alterações posteriores precisam ser validadas antes de atualizar a instância. O gateway é o único serviço que participa também da rede existente agendz_default, para que o Caddy de entrada consiga encaminhar os domínios. Nenhuma porta de banco ou API é publicada.

- Domínios solicitados: h-estetica.agendz.io, h-barbearia.agendz.io e h-admin.agendz.io. Criar as lojas h-estetica e h-barbearia somente no banco de homologação, com dados fictícios.
- Arquivos, segredos, volumes e credenciais devem ser exclusivos de homologação; não copie bancos, chaves ou dados reais. VAPID e reCAPTCHA ficam vazios nesta proposta. Revisar e desativar outras integrações e envios reais antes do primeiro uso.
- Informar H_AGENDZ_IMAGE e H_ADMIN_IMAGE como imagens específicas da versão candidata, preferencialmente por digest; nunca reutilizar latest. O Admin atualmente é carregado por SSH: adaptar o processo para etiquetar e transferir a imagem candidata sem sobrescrever a de produção.
- Gerar o site real com AGENDZ_DOMINIO=agendz.io a partir da versão candidata e disponibilizar o conteúdo estático em ./site; conferir site, service worker e caminhos dos ativos. Guardar os identificadores das versões de ambos os repositórios e do front-end.
- Antes de publicar, verificar DNS e capacidade da VPS, configurações de rede, segredos, integridade do certificado, autorização de acesso, migrações, testes de isolamento e ausência de efeitos externos. Validar Caddy e Compose em ambiente seguro. O exemplo Caddyfile-proxy.exemplo requer revisão e alteração coordenada do Caddy que atende produção.
- Os workflows atualmente publicados na main ainda podem publicar produção automaticamente. Os arquivos locais preparam candidatos de homologação e promoção manual, mas essa proteção só valerá após incorporação autorizada à main. Até lá, um deploy da API de produção pode substituir o Caddy e remover as rotas de homologação.
- Para novos tipos, adicionar lojas e domínios por configuração e revisar regras específicas, sem duplicar a aplicação por tipo.

- A rede interna da homologação bloqueia a saída direta das APIs e bancos para a internet. Isso impede integrações externas e também significa que recursos que dependam delas não funcionarão até existir uma liberação controlada. O gateway participa da rede de entrada apenas para receber as requisições; validar o isolamento efetivo na VPS antes de liberar o acesso.

- O encadeamento dos dois Caddy precisa preservar com segurança o IP real do cliente: as APIs usam X-Forwarded-For para controles de acesso e auditoria. Validar o comportamento e a confiança no proxy de entrada antes de publicar; não confiar cegamente em cabeçalhos enviados pelo navegador.

- H_PROXY_CIDR deve conter somente a sub-rede da rede Docker em que está o Caddy de entrada, confirmada por inspeção no momento do deploy. O gateway confia nos cabeçalhos encaminhados por essa sub-rede; todos os serviços com acesso a ela fazem parte desse limite de confiança. Validar IP real e tentativas de forjar cabeçalhos antes de abrir a homologação.

- Na pasta própria de homologação, o script preparar-homologacao.sh pode criar o .env privado a partir de duas imagens fixadas por digest ou commit completo; ele não inicia serviços e não substitui credenciais existentes. Confira o valor de H_PROXY_CIDR e a rede antes de usar. Nunca copie o .env de produção.

- Os jobs candidato-homologacao dos dois repositórios preparam versões somente após o CI passar, para branches homologacao/* e com a variável HOMOLOGACAO_AUTOMATICA=true em cada repositório. Eles guardam imagens e arquivos identificados pelo commit na VPS; não ativam serviços. Exigem VPS_KNOWN_HOSTS para verificar o servidor. Uma falha no envio pode deixar um diretório incompleto, sem o arquivo pronto, que deve ser inspecionado antes de nova tentativa.

- Os candidatos ficam em /opt/agendz/homologacao/candidatos, separados dos arquivos ativos; cada repositório guarda sua versão pelo SHA completo. Isso exige acesso de escrita ao diretório /opt/agendz, sem sudo no job.

- iniciar-primeira-homologacao.sh recebe os dois commits completos e inicia somente a primeira instalação privada, se candidatos estiverem prontos e não houver ambiente, contêineres ou volumes anteriores. Ele não altera o Caddy público, não cria lojas e não substitui uma instalação existente; falhas após a criação exigem inspeção manual, sem apagar volumes.

- A configuração local agora exige acionamento manual para publicar produção, salvo se DEPLOY_PRODUCAO_AUTOMATICO for explicitamente definido como true. O site faz o CI antes de publicar; as APIs verificam um CI aprovado no mesmo commit da main. Essa proteção ainda não está ativa na produção até os workflows serem incorporados à main. Não acione promoção sem aprovação específica do Marcelo.

- O gateway participa de duas redes. Nunca use os nomes genéricos api ou admin-api em seu Caddy: eles também existem na rede de produção. Use os aliases exclusivos agendz-homologacao-api e agendz-homologacao-admin-api, execute o teste de isolamento e confirme a resolução no Docker antes de publicar qualquer alteração.

- atualizar-site-homologacao.sh instala apenas o site de um candidato completo e guarda cópia do index anterior; não atualiza APIs nem bancos. A atualização automática das APIs e a promoção integral ainda precisam ser implementadas e testadas.
