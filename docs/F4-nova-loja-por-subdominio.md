# F4: loja nova só com um subdomínio

## Como fica (pronto na infraestrutura)
1. **DNS:** o registro curinga `*.agendz.io` já aponta para a VPS. Nada a fazer por loja.
2. **Certificado:** o Caddy emite sob demanda na primeira visita, **só se** a API responder 200 em `/interno/dominio-permitido?domain=` (loja existe ou domínio próprio verificado). Nome desconhecido não gasta o limite do Let's Encrypt (50 certificados/semana por domínio).
3. **Banco:** um comando na VPS cria a loja, o dono e a senha temporária forte (mostrada uma vez) e confere o endereço:
   `bash nova-loja.sh barbearia-x "Barbearia X" barbearia joao "João"`
4. **Primeiro acesso:** o dono entra, troca a senha e cai no modo de inicialização (F3: escolher serviços de exemplo do tipo e cadastrar a equipe de forma simples).

## Falta para "resolver o restante" sozinho
- **F2 parte 1:** o site publicado ler a loja pela API (`GET /api/publico/loja`) em vez de `lojas-demo.js`. Hoje um subdomínio novo responde "Loja não encontrada" no front mesmo existindo no banco.
- **Onboarding** (endpoints + `ui/PrimeiroAcesso.jsx`): catálogo de exemplos por tipo.
- **Painel da plataforma** (`POST /plataforma/lojas`, só dono da plataforma): troca o comando por um formulário. O comando continua como plano B.
- Domínio próprio do cliente: verificação por DNS (TXT) antes do `ask` liberar.

## Prompt para criar um cliente novo (use depois da F2 parte 1)
> Crie a loja `<subdominio>` ("<Nome>", tipo `<tipo>`, dono `<login>`/"<Nome do dono>") em produção: rode `nova-loja.sh` na VPS, confirme o endereço com `deploy/smoke-producao.sh` (`SMOKE_LOJAS="<subdominio>:<tipo>"`), confira que o tipo e a marca (logo em `deploy/logos/<subdominio>.txt` ou ícone do tipo) estão certos e me entregue a senha temporária só no terminal. Não toque em outras lojas. Registre a loja em `docs/ESTADO-DO-PROJETO.md`.

## Testes
`tests/nova-loja.test.mjs` (Caddy com `ask`, `/interno` escondido, reservados iguais aos do banco, entradas inválidas recusadas); `LojaPorEnderecoTest` (backend: `ask` só libera loja existente/domínio verificado). Caddy e Docker não rodam neste ambiente: o teste real é `nova-loja.sh` na VPS + `smoke-producao.sh`.
