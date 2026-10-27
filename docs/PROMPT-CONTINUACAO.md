# Prompt de continuação do Claude (Agendz)

Cole este texto no início de uma sessão nova (ou diga "siga o `docs/PROMPT-CONTINUACAO.md`").

---
Você trabalha no Agendz (repositório `lemarcelo/agendz`, pasta `agendz`). Antes de tudo leia `CLAUDE.md`, `docs/ESTADO-DO-PROJETO.md` e `docs/CHECKLIST-MARCELO.md` (o que já foi marcado pelo Marcelo).

**Modo:** autônomo. Trabalhe a fila abaixo sem pedir confirmação; decida com bom senso, registre no histórico e avise no resumo. Português do Brasil, respostas curtas.

**Pare e pergunte só se:** (a) a decisão for irreversível ou custar dinheiro; (b) exigir mudar uma regra fixa do `CLAUDE.md` (ex.: regra 9, Artifact sem rede); (c) precisar de credencial, conta ou segredo novo; (d) o item estiver em "Bloqueado por Marcelo". Nesses casos, adiante tudo que não depende da resposta e siga para o próximo item.

**Fila (nesta ordem):**
1. `POST /plataforma/lojas` (criar loja com tipo imutável e dono) + verificação de domínio por DNS. É o que falta para produção ter alguma loja.
2. Estabelecimento (configuração da loja), escala/expediente e exceções; a agenda passa a validar "o profissional atende nesse horário".
3. Estética: box, veículo e porte (preço e duração por porte), serviço de vários dias.
4. Tick automático (`@Scheduled` + `Clock`) e plano de mensagens/notificações; status manual.
5. Cupom, estoque/material, comissão (regras de `docs/MAPA-API-SPRING.md`).
6. Financeiro e Pix: interface do provedor + simulador; BR Code e conciliação. WhatsApp: interface (formato Meta) + simulador. Só ligue provedor real quando o Marcelo escolher.
7. F2 (front na API real) — **só depois do "sim" dele** (`docs/F2-front-na-api-real.md`): `auth` + bootstrap primeiro.
8. Gate 3 (e), arquivos por loja, quando existir upload.

**Bloqueado por Marcelo:** segredos do GitHub, DNS, GHCR público, conta Meta, escolha do provedor Pix, INPI, dados reais das lojas.

**Pronto significa:** teste novo que falha sem a correção; testes de isolamento entre lojas (Gate 3) para todo recurso novo (404 em outra loja, 403 token de outra loja, RLS); `npm run verificar` quando mexer no front; CI verde no GitHub; `docs/MAPA-API-SPRING.md`, `docs/ESTADO-DO-PROJETO.md` e `prompt-agendz-regras.md` atualizados; commit e push com a atribuição; Artifact republicado se o front mudou.

**Limites do ambiente:** sem SSH de saída (não mexo na VPS), sem Maven Central nem Docker aqui — o CI é o compilador e o teste do back-end (acompanhe com `gh api repos/lemarcelo/agendz/actions/runs/...`, anotações em `tools/anotar-falha-maven.sh`). Para validar SQL, suba um PostgreSQL 16 local descartável. Nunca coloque segredo em arquivo ou log.

**Relato final (≤ 10 linhas):** feito · decisões tomadas sem confirmação · o que depende do Marcelo · próximo passo.
