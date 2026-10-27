# Prompt: aba Cobrança em Estabelecimento (cobrança por agenda) e serviços por profissional (RASCUNHO, não executado)

> Pedido do Marcelo em 27/10 (15:13). Complementa `docs/PROMPT-PLATAFORMA-COBRANCA.md` (painel da plataforma, faturas, Pix) e usa o modelo de licenças dali. Regras fixas do projeto (`CLAUDE.md`) valem para tudo. O que não foi respondido usa o **padrão** da seção 6.

## 1. O que o Marcelo pediu (nas palavras dele, organizado)
1. Em **Estabelecimento**, uma aba/seção **Cobrança** com o **valor da cobrança do sistema**, calculado pelo quadro que atende.
2. Os clientes (Dalforno, Offbox, Apex) são cobrados **por agenda**: na **estética automotiva cada agenda é um box**; na **barbearia cada agenda é um funcionário que realiza serviços**.
3. Os **serviços de cada funcionário** ficam disponíveis para selecionar o que ele faz; **ele mesmo** pode adicionar ou não os serviços que realiza.

## 2. Unidade de cobrança = "agenda" (muda a licença por funcionário do outro prompt)
- `definicao.js` de cada tipo ganha `unidadeCobranca`: `'box'` (estetica_automotiva) ou `'profissional'` (barbearia). O código pergunta a capacidade, nunca `if (tipo === ...)`. Rótulo na tela por `vocab` ("box" / "profissional"): nunca texto fixo.
- Conta como agenda: **box ativo** (`estabelecimento.boxes`, ativo) na estética; **usuário ativo que atende** (`usuario.atende`) na barbearia. Dono que não atende, atendente de balcão e, na estética, esteticista **não** pagam por si (o box é a unidade). Dono que atende conta 1 na barbearia.
- A tabela `licenca` do outro prompt vira `licenca (loja_id, tipo_agenda 'box'|'profissional', agenda_id, ativa_de, ativa_ate)`: criar/ativar box ou profissional que atende abre a licença; desativar fecha na data. Nada é apagado; a fatura congela a lista usada. Pro rata em dias, centavos inteiros, relógio injetável (igual ao outro prompt).
- O dono vê o custo **antes** de confirmar ("+ R$ 39,00/mês a partir deste ciclo") ao criar box ou profissional que atende (também no assistente de primeiro acesso e no Reconfigurar).

## 3. Aba Estabelecimento > Cobrança (só o dono; substitui a "Assinatura" do outro prompt)
- Mostra: tipo de agenda ("Boxes" / "Profissionais"), **quantidade e nome de cada agenda cobrada**, valor por agenda (definido no contrato pelo Marcelo; o dono só lê), **total mensal estimado** (quantidade × valor), próximo vencimento, situação (em teste, ativo, em atraso, suspenso), faturas anteriores e a forma de pagar (Pix) quando o provedor existir.
- Entrega em fatias (cada uma com testes e CI verde):
  - **C1 (Artifact + back-end de leitura):** a aba mostra quantidade, nomes e total estimado. Preço vem de `loja_contrato` (servidor); sem contrato = "Valor definido em contrato" e sem total. No Artifact, valor de demonstração e aviso "simulação". Valores nunca vêm do cliente; `r2`/centavos; teto.
  - **C2:** licenças reais (histórico, pro rata) e aviso de custo antes de criar box/profissional.
  - **C3:** faturas, Pix e suspensão (fases P2 a P4 do outro prompt).
- Permissão: só `ehDono`; profissional recebe 403 e nem vê a aba (teste). `GET /api/estabelecimento/cobranca`.

## 4. Serviços de cada profissional
- Novo cadastro `usuario_servico (loja_id, usuario_id, servico_id)` (RLS por loja): o que cada profissional **realiza**. No front, `usuario.servicoIds` (lista, até 60, ids por tipo e tamanho; `pegar` + `limparTexto`).
- Quem edita: o **dono** edita a lista de qualquer profissional; o **profissional edita só a própria** ("Meus serviços": marca ou desmarca entre os serviços ativos da loja). Qualquer outro caso = erro, nunca dado (regra 1; teste de IDOR).
- Efeito na agenda: só se oferece/aceita o profissional para serviço que ele realiza, em **todos os caminhos**: Atender, remarcar, link do cliente, WhatsApp, `validarHorario`/`acharConflitos` (regra 5). Agendamento já existente com serviço que o profissional deixou de fazer **continua valendo** (a mudança vale daí em diante); a tela avisa quantos agendamentos futuros ficam nessa situação, sem cancelar nada.
- Padrão: profissional novo e os já existentes começam com **todos os serviços ativos marcados** (migração), para ninguém sumir da agenda; ele ou o dono desmarca o que não faz. Serviço novo criado depois entra marcado para quem tinha "todos" (padrão: fica desmarcado para todos e o dono marca; decisão na seção 6).
- Assistente de primeiro acesso e Reconfigurar: passo Equipe ganha, por pessoa, "o que ela faz" (opcional; vazio = todos).
- Estética: o esteticista também tem a lista; o box continua sendo recurso à parte (`escolherBox`).

## 5. Testes e segurança (obrigatórios)
Unidade de cobrança por tipo (box na estética, profissional na barbearia, nenhum `if` de tipo); contagem ignora box/profissional inativo; pro rata em 5/15/35 dias com relógio fixo; dono lê, profissional 403; valor e preço só do servidor; IDOR (profissional A não edita serviços do B; loja A não lê cobrança da B); serviço fora da lista do profissional recusado em Atender, remarcar, link e WhatsApp; e2e da aba (estética e barbearia, 390 px com fonte larga); `tests/tipos.test.mjs` sem texto fixo; `docs/MAPA-API-SPRING.md` e o prompt vivo atualizados.

## 6. Perguntas (padrão entre parênteses)
1. Estética: cobrar **só por box**, o esteticista não paga? (sim)
2. Box desativado ou profissional que deixa de atender: sai da cobrança **no dia** (pro rata), sem devolver o já pago? (sim)
3. Preço por agenda **igual para a loja toda**, definido no contrato por loja, podendo diferir de uma loja para outra? (sim)
4. "Ele mesmo podendo adicionar" é **marcar/desmarcar entre os serviços da loja** (padrão) ou também **criar serviço novo** no catálogo? (só marcar; criar continua com quem tem permissão em Serviços)
5. Serviço novo da loja entra marcado para os profissionais? (não: o dono marca)
6. Dono que atende na barbearia conta como agenda? (sim, 1)

## 7. Ordem sugerida na fila
Serviços por profissional (seção 4) pode vir **antes** da cobrança, pois vale para a agenda de qualquer jeito. Depois C1 (leitura), e C2 a C3 junto com o painel da plataforma (item 5 de `docs/PROMPT-CONTINUACAO.md`).
