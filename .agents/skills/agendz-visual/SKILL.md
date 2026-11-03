---
name: agendz-visual
description: Padroniza implementação e revisão visual do Agendz em computador e celular, preservando temas, cores por loja e comportamento existente.
---

# Visual do Agendz

Use ao criar ou alterar telas do Agendz. Antes de editar, identifique comportamento existente, componentes e estilos compartilhados que possam afetar outras telas. Preserve permissões, dados, regras de negócio e funcionalidades; não fixe o nome, logo ou cor de uma loja.

1. Use os tokens e cores gerados a partir da marca da loja e os temas claro e escuro existentes. Preserve vocabulário e capacidades de cada tipo.
2. Faça o menor ajuste coerente. Priorize hierarquia, alinhamento, legibilidade, consistência entre componentes, navegação identificável, foco e alvos de toque; preserve uso com teclado e textos longos.
3. Confira computador e celular, inclusive largura intermediária, sem cortes, sobreposição ou rolagem lateral indesejada. Itens novos, quantidade variável, estados vazios e erros não podem quebrar a disposição. Reutilize os componentes do projeto.
4. Após implementar, faça apenas o necessário para abrir a tela local e verifique as áreas afetadas e vizinhas. Mostre no chat capturas reais ou prévia interativa para computador e celular, identificando dados fictícios, e aguarde a avaliação visual de Marcelo antes da suíte completa, CI ou deploy. Aplique comentários e apresente novamente se mudar a proposta.
5. Após a avaliação, rode testes relevantes de comportamento e responsividade, incluindo regressões para defeitos encontrados. Não repita verificações ainda válidas sem motivo; registre o que foi visto e testado, e declare limitações.

O desktop pode usar navegação lateral e o celular menu recolhível quando aprovados para a tela; mantenha todas as opções acessíveis, sem alterar regras ou permissões. Padrões visuais aprovados não substituem testes de funcionalidade.
