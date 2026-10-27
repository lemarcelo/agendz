# Prompt: painel da plataforma, licenças por funcionário e cobrança (RASCUNHO, não executado)

> Status: aguardando as respostas da seção 6. Quem não for respondido usa o **padrão** indicado. Regras fixas do projeto (`CLAUDE.md`) valem para tudo aqui.

## 1. Objetivo
Marcelo (dono da plataforma) acompanha, num painel só dele, todos os clientes (lojas), quantos funcionários cada um licencia, quanto cada um deve, o que foi pago e quem está em atraso. A cobrança é por funcionário, com preço definido por cliente (ex.: Offbox R$ 39,00 por funcionário). Vence todo dia 15, com boleto ou Pix gerado pela própria aplicação. Sem pagamento em 20 dias, o sistema do cliente sai do ar até regularizar. Criar cliente novo (e o subdomínio) vira um formulário do painel.

## 2. Painel da plataforma (`admin.agendz.io`, nome reservado)
- **Acesso separado das lojas:** tabela própria `plataforma_usuario`, login próprio, token sem `loja`, 2º fator (TOTP) obrigatório. Nenhum usuário de loja chama `/api/plataforma/**` (teste: 403).
- **Clientes:** lista com status (`em_teste`, `ativo`, `em_atraso`, `suspenso`, `encerrado`), nº de funcionários licenciados, preço por funcionário, valor do próximo vencimento, último pagamento. Filtros e ordem personalizável (`<Tabela id=…>`).
- **Cliente:** contrato (preço por funcionário com histórico de vigência, dia de vencimento, desconto, carência), licenças (quem, desde quando, até quando), faturas, pagamentos, linha do tempo (auditoria: quem fez o quê, quando).
- **Ações manuais (com motivo, auditadas):** criar loja, mudar preço (vale da próxima fatura em diante), dar baixa manual, estender prazo, suspender, reativar, encerrar.
- **Resumo:** receita mensal prevista, recebida, em atraso, inadimplência, lojas por tipo.
- **Dono da loja vê** (em Estabelecimento > Assinatura): quantos funcionários estão licenciados, valor, próximo vencimento, boleto/Pix para pagar, faturas anteriores. Funcionário comum não vê.

## 3. Licença por funcionário
- Licença = usuário ativo da loja que **atende** (`usuario.atende`; dono que não atende e atendente de balcão não pagam: ver pergunta 1). Cadastrar um novo funcionário que atende cria licença; desativar encerra a licença na data.
- Histórico em `licenca (loja_id, usuario_id, ativa_de, ativa_ate)`: nada é apagado; a fatura congela a lista usada.
- O dono vê o custo antes de confirmar o cadastro ("+ R$ 39,00/mês a partir deste ciclo").
- Cobrar mais funcionários do que o contrato permite nunca acontece em silêncio: o painel mostra a diferença.

## 4. Ciclo de cobrança (padrões)
- **Vencimento:** dia 15 de cada mês (se cair em dia não útil, vale o próximo dia útil só para o boleto; o prazo de 20 dias conta do vencimento original).
- **Emissão:** dia 5, com a contagem de licenças do dia da emissão; valor = licenças × preço do cliente, em centavos inteiros, congelado na fatura. Funcionário entrando depois da emissão entra proporcional por dia na fatura seguinte (`pro rata`).
- **Fatura:** `fatura (loja_id, competencia, vencimento, valor_centavos, status, itens congelados)`; status `aberta`, `paga`, `vencida`, `cancelada`. Fatura paga não é recriada nem apagada; valor nunca vem do cliente.
- **Meios:** boleto registrado e Pix (copia e cola/QR) por **provedor de pagamento** (seção 5); o dono escolhe na hora, as duas formas ficam válidas até o pagamento de uma delas.
- **Baixa:** só por **webhook do provedor** (autenticado, idempotente, valor conferido com a fatura) ou baixa manual do Marcelo. Pix compensa na hora; boleto em 1 a 3 dias úteis, e conta pelo pagamento compensado.
- **Avisos ao dono:** 5 dias antes, no vencimento, +5, +10, +15 e +19 dias (e-mail e faixa na tela); sem spam: um por data.
- **Suspensão:** 20 dias após o vencimento sem pagamento compensado, a loja fica **suspensa**: a API devolve 402 "Sistema suspenso por falta de pagamento" (menos login, tela de pagamento e a própria fatura); a página de agendamento do cliente final mostra "Agendamento indisponível". **Dados ficam guardados** (nada é apagado). Pagou, reativa sozinho em segundos. Quem decide a suspensão é o relógio do servidor (testável com relógio fixo).
- **Encerramento:** após 90 dias suspensa, o painel pergunta ao Marcelo (exportar dados e encerrar); nunca apaga sozinho.

## 5. Provedor de pagamento (precisa de decisão)
Gerar boleto válido e conciliar Pix exige uma instituição (não dá para a aplicação "gerar boleto" sozinha). Opções com API de boleto + Pix + webhook: **Asaas**, **Efí (Gerencianet)**, **Iugu**, **Pagar.me**. Padrão proposto: Asaas (conta de cobrança simples, sandbox gratuito). A implementação usa uma interface `ProvedorCobranca` (criar cobrança, consultar, cancelar, validar webhook) com **simulador** para testes, como já é feito com Pix/WhatsApp; o provedor real só entra com a chave guardada como segredo (nunca no repositório).

## 6. Perguntas (responda o que quiser; o resto vai no padrão)
1. **Quem conta como funcionário pago?** Padrão: só quem atende (profissional). Alternativa: todo usuário com login.
2. **Cobrança antecipada ou pelo uso?** Padrão: antecipada (emite dia 5 para o mês corrente, vence dia 15), pro rata nas entradas.
3. **Funcionário que sai no meio do mês:** padrão: já pago não é devolvido; não entra na próxima.
4. **Mínimo por cliente** (ex.: 1 licença)? Padrão: sem mínimo.
5. **Período de teste** para loja nova? Padrão: 14 dias grátis, sem cartão, depois a primeira fatura.
6. **Você já tem CNPJ/MEI e conta no provedor?** Sem isso, o boleto real não sai; o resto fica pronto com o simulador. Padrão: seguir com simulador e deixar o provedor como a última etapa.
7. **Nota fiscal de serviço (NFS-e)** emitida pela plataforma? Padrão: fora do escopo agora (fala com o contador).
8. **Contrato/termos de uso** com cláusula de suspensão e de dados: precisa de revisão de advogado antes do primeiro cliente real. Não sou advogado; deixo o texto-modelo e o aceite registrado no cadastro.
9. **Clientes já existentes** (Apex, Dalforno, Offbox): entram como `ativo` sem fatura até uma data que você definir (padrão: 1ª fatura só depois do período de teste/combinado).
10. **Multa e juros por atraso?** Padrão: nenhum (só a suspensão).
11. **Domínio:** painel em `admin.agendz.io` (reservado) só depois da decisão do domínio, como combinado.

## 7. Ordem de entrega (cada passo com testes e CI verde antes do próximo)
- **P0** Modelo de dados e migrações (`plataforma_usuario`, `loja_contrato`, `licenca`, `fatura`, `pagamento`, `evento_plataforma`), sem RLS de loja nas tabelas da plataforma, com testes de isolamento (lojas não leem nem escrevem nelas).
- **P1** Painel de leitura + criação de loja pelo formulário (`POST /api/plataforma/lojas`: cria loja, dono e senha temporária mostrada **uma vez** no painel, contrato; o subdomínio já funciona pelo Caddy sob demanda). Substitui `nova-loja.sh`, que fica como plano B.
- **P2** Contrato por cliente, licenças e geração de fatura (relógio injetável, cálculo em centavos, pro rata), com simulador de provedor.
- **P3** Suspensão e reativação (filtro 402), avisos, tela "Assinatura" do dono.
- **P4** Provedor real em sandbox (webhook autenticado e idempotente), depois produção quando houver conta.
- **P5** Relatórios do painel e exportação.

## 8. Testes e segurança (obrigatórios)
Autorização (loja ≠ plataforma, IDOR entre lojas), valores só do servidor, webhook sem assinatura = 401, webhook repetido não paga duas vezes, valor divergente não baixa, relógio fixo para 5/15/35 dias, suspensão e reativação ponta a ponta, dados da fatura (CPF/CNPJ do cliente) cifrados, nenhum segredo em log, e2e do painel em 390 px. Mapa de rotas em `docs/MAPA-API-SPRING.md` e histórico no prompt vivo.
