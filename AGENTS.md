# Orientações para agentes

Leia também `CLAUDE.md` deste repositório e as orientações do workspace, quando disponíveis.

- Valide entradas JavaScript com Zod, preservando as regras e mensagens existentes; as APIs Spring continuam responsáveis pela validação no servidor.
- Use Jest para testes de lógica, Playwright para interações no navegador e JUnit/Spring Test com Testcontainers para o backend. Preserve os casos existentes ao migrar testes. Execute também `node tools/rodar-testes-tipo.mjs barbearia unidade` quando a mudança afetar a barbearia.
- Helmet é middleware Node/Express e não se aplica às APIs Spring Boot; mantenha as proteções HTTP no Spring Security e no Caddy. Para senhas, mantenha BCryptPasswordEncoder; dados recuperáveis exigem criptografia.
- Homologação usa bancos, volumes, rede, segredos e domínios próprios. O gateway deve usar os aliases exclusivos `agendz-homologacao-api` e `agendz-homologacao-admin-api`; nunca os nomes genéricos da produção. Valide `tests-jest/homologacao-isolamento.test.mjs` e a resolução real no Docker.
- O WhatsApp aberto manualmente no navegador deve funcionar em homologação; use contatos fictícios ou autorizados. As APIs de homologação permanecem isoladas de integrações externas até que haja configuração de teste apropriada.
- Envie candidatos para branches `homologacao/*` e aguarde os testes. Não publique produção nem integre em `main` sem aprovação específica. Enquanto as proteções novas não estiverem na `main`, um push nela ainda pode publicar produção e sobrescrever o roteamento de homologação.

- Uma mudança nas migrações bloqueia a atualização automática de homologação: revise a alteração e prepare backup antes de atualizar. Voltar a imagem não desfaz migrações do banco.
- Ao migrar limites de texto para Zod, confira a contagem de caracteres especiais e emojis: algumas verificações do Zod podem divergir de String.length. Preserve o contrato e teste os limites.
- Botões sobre seções ou cards para edições ou detalhes devem SEMPRE abrir em modal (fechar ao clicar fora, Escape e trava de scroll no fundo).
- Testes visuais devem ser inteligentes: em alterações ou novas telas, valide apenas a tela impactada e seus modais, sem rodar toda a aplicação; a validação de toda a aplicação só ocorre quando solicitada expressamente.
- Alternância de abas em qualquer tela do sistema deve ter transição suave com animação CSS (fade-in sutil, sem troca abrupta/piscando).
- Blocos de métricas e relatórios devem obrigatoriamente possuir hint explicativo (hover no PC, clique/toque no celular).
- Revisões visuais e validações mecânicas devem priorizar modelos econômicos e testes automatizados, evitando consumo desnecessário de tokens.

- Antes de executar testes locais de implementação, confira as mensagens mais recentes desta conversa e eventuais itens pendentes disponibilizados pelo ambiente; incorpore alterações compatíveis e agrupe sua validação em uma única rodada apropriada. Não afirme ter conferido filas que não estejam acessíveis e não adie testes necessários quando não houver mensagens disponíveis.
