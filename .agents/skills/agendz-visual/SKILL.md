---
name: agendz-visual
description: Padroniza implementação e revisão visual do Agendz em computador e celular, preservando temas, cores por loja e comportamento existente.
---

# Visual do Agendz

Use ao criar ou alterar telas do Agendz. Antes de editar, identifique comportamento existente, componentes e estilos compartilhados que possam afetar outras telas. Preserve permissões, dados, regras de negócio e funcionalidades; não fixe o nome, logo ou cor de uma loja.

1. Use os tokens e cores gerados a partir da marca da loja e os temas claro e escuro existentes. Preserve vocabulário e capacidades de cada tipo. Quando pedida cor semântica em botões secundários/ações (ex.: Concluir verde, Remarcar amarelo, Cancelar vermelho, Confirmar azul), siga o padrão outline de `.btn-perigo` (`background: transparent; color: var(--cor); border-color: var(--cor)`), sem chapar o fundo.
   Em modais e barras de ação, organize botões em colunas ou linhas simétricas e balanceadas:
   - **Simetria e alinhamento obrigatórios**: botões da esquerda devem ter a mesma coordenada `x` de início (alinhamento lateral com 0px de desvio), e botões da direita devem terminar na mesma extremidade (`100%`). Nunca empurre uma linha inteira com `justify-content: flex-end` quando houver elementos alinhados à esquerda na linha abaixo, pois isso cria flutuação no vazio e quebra a harmonia visual.
   - **Espaçamento proporcional em porcentagem (`%`)**: quando pedido espaço de "cerca de um botão" entre ações opostas, defina larguras relativas iguais (ex.: `width: 35%` ou `flex: 0 0 35%`) e use `justify-content: space-between` para que o centro reserve automaticamente ~30% de respiro, equivalente a 1 botão.
   - Em barras com Cancelar e Concluir, mantenha sempre **Cancelar à esquerda** (`0%`) e **Concluir à direita** (`100%`).
   - No modal da agenda com ações intermediárias (Remarcar e Confirmar), alinhe **Remarcar à esquerda** e **Confirmar à direita** na linha superior, simétricos a Cancelar e Concluir abaixo.
   - Registros de auditoria ou histórico devem ser recolhidos em dropdown/acordeão abaixo das ações, com linguagem amigável em português e scroll vertical, restritos a papéis autorizados (proprietário e suporte).
2. Faça o menor ajuste coerente. Priorize hierarquia, alinhamento, legibilidade, consistência entre componentes, navegação identificável, foco e alvos de toque; preserve uso com teclado e textos longos.
3. Confira computador e celular, inclusive largura intermediária, sem cortes, sobreposição ou rolagem lateral indesejada. Itens novos, quantidade variável, estados vazios e erros não podem quebrar a disposição. Reutilize os componentes do projeto.
   Em listas reordenáveis aprovadas, use alça à esquerda, movimento perceptível durante o arraste e alternativa por teclado; não exiba setas redundantes. Preserve rolagem e persistência existentes.
4. **Validação Visual Precisa e Barata (sem queimar tokens de visão)**:
   - Em vez de analisar imagens pesadas com visão multimodal (caro e passível de alucinação), valide o layout **por código** via asserções geométricas de `boundingBox()` no Playwright:
     - `Math.abs(boxEsquerdaTop.x - boxEsquerdaBottom.x) < 2` (alinhamento lateral esquerdo).
     - `Math.abs((boxDireitaTop.x + boxDireitaTop.width) - (boxDireitaBottom.x + boxDireitaBottom.width)) < 2` (alinhamento lateral direito).
     - `Math.abs(boxEsquerda.width - boxDireita.width) < 2` (simetria de larguras).
     - `gapCentral = boxDireita.x - (boxEsquerda.x + boxEsquerda.width)` dividido pela largura do botão deve bater a proporção pedida (ex.: ~0.7x a 1.0x).
     - `scrollWidth <= innerWidth` em 390px e 1366px.
   - Após a validação matemática por código passar, gere os prints apenas para apresentação final ao Marcelo.
5. Após implementar qualquer alteração visual, mostre no chat as telas reais (`1366px` e `390px`) e explique em texto resumido o que foi alterado, aguardando a avaliação de Marcelo antes de push, CI ou deploy.
6. **Alternância de Modelos em Revisões**:
   - Modelos mais leves (Flash) executam tarefas diretas de código sob testes rigorosos.
   - **Antes de pedir autorização para push/deploy**, faça a revisão final com modelo mais analítico (Claude ou Gemini Pro), verificando integridade de regras, simetria visual por código e ausência de regressões.
7. **Ações Suaves e Comportamento do Menu Principal**:
   - **Padrão Desktop (PC)**: O menu lateral inicia **recolhido por padrão** (`68px`), exibindo apenas ícones e alinhamento compacto. Não há persistência de estado aberto/recolhido por usuário no backend.
   - **Expansão e Recolhimento Suaves**: Ao passar o mouse (`hover`), o menu expande suavemente para largura total (`220px`), revelando rótulos com transição suave `cubic-bezier(0.16, 1, 0.3, 1)` de `0.28s` e fade-in de texto (`opacity` e `max-width`). Ao selecionar qualquer item de navegação, o menu recolhe suavemente de imediato.
   - **Ordem Programada por Uso Sem Pulos Visuais**:
     - Apenas itens com pelo menos 10 acessos nos últimos 7 dias sobem para o topo (`qtd >= 10`). Itens com menos de 10 cliques não contabilizam para subir e mantêm a ordem base.
     - A ordem exibida na interface permanece congelada enquanto o menu estiver aberto ou sob o cursor (`menuHover` / `menuAberto` ativos): a reorganização programada ocorre **exclusivamente quando o menu está recolhido** (fora do campo visual ativo). Quando o usuário abre ou passa o mouse de novo, os itens já se encontram na nova disposição, eliminando qualquer salto ou deslocamento brusco na frente do usuário.

**Movimento e expansão de conteúdo:** ao abrir históricos, acordeões ou detalhes dentro de um modal, preserve a posição do topo e expanda para baixo com transição curta e suave. Limite a altura ao espaço visível e permita rolagem interna quando necessário; não desloque o fundo nem o foco. Respeite `prefers-reduced-motion` e garanta acesso por teclado e estados expandido/recolhido. Verifique em celular e computador com conteúdo curto e longo, inclusive a posição do modal antes e depois da abertura.

8. **Bloqueio Obrigatório de Scroll Externo em Modais (Scroll Lock & Anti-Chaining)**:
   - **Regra Geral**: Toda e qualquer sobreposição na tela (modal, diálogo de confirmação, drawer ou bottom sheet) deve travar imediatamente a rolagem da página externa (document.body com overflow: hidden ou container principal travado).
   - **Isolamento de Rolagem Interna**: O container do modal e o backdrop devem conter overscroll-behavior: contain para impedir que o scroll interno encadeie para o fundo ao atingir o topo ou o fim do conteúdo (*scroll chaining*).
   - **Restauração Limpa**: Ao fechar o modal (por botão, clique no backdrop ou tecla Escape), o scroll do fundo deve ser restaurado de imediato, sem saltos de posição.
   - **Validação Automatizada por Código**: Validar em teste Playwright que window.scrollY não se altera ao disparar mouse.wheel() com o modal aberto e que document.body recebe a trava enquanto o modal existir no DOM.

O desktop pode usar navegação lateral e o celular menu recolhível quando aprovados para a tela; mantenha todas as opções acessíveis, sem alterar regras ou permissões. Padrões visuais aprovados não substituem testes de funcionalidade.
