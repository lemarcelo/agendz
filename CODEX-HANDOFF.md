# 📋 Handoff Executivo para OpenAI Codex (`agendz`)

> **Data de Atualização:** 02/11/2026  
> **Transição de Sessão:** Antigravity / Argon (Claude Sonnet 3.7) ➔ OpenAI Codex (ChatGPT / codex.exe)  
> **Status do Repositório:** 100% Limpo, branches `main` e `feat/fila` sincronizadas, CI/CD verde e Deploy em Produção verificado.

---

## 🎯 1. Contexto e Solicitação Recente do Usuário
1. **Redirecionamento de Cota (Argon em 60%):** A OpenAI/Codex passa a ser a **1ª opção prioritária** para Arquitetura, Implementação (`Code`), Correção (`Fix`) e Revisão (`Review`), mantendo Claude/Argon apenas como fallback secundário.
2. **Loop Autônomo Fechado (Estilo Claude Code):** Toda tarefa deve diagnosticar causas-raiz, aplicar correções de código/migração/testes e iterar de forma 100% autônoma, sem repassar travamentos técnicos triviais ao usuário.
3. **Deploy Verificado em Produção:** Nenhuma tarefa de deploy é concluída sem que a esteira passe (`success`), a VPS seja atualizada e um teste real externo (HTTP/Headless) acesse `https://apex.agendz.io/` comprovando o funcionamento.

---

## 🚀 2. O que foi Concluído nesta Sessão
1. **Frontend do Atender em Etapas (Mobile & Desktop):**
   - Implementado o novo fluxo de Atendimento sem necessidade de rolar a tela, espelhando a experiência da página `#agendar`.
   - Adicionada navegação em abas/etapas (`pub-passos`, `atender-prox-servicos`, `atender-prox-quando`).
   - Caixas de seleção clicáveis de Porte com exemplos visuais de veículos (`Pequeno`, `Médio`, `Grande`, `SUV`, `Pickup`).
   - Modo "Agora" (atendimento presencial imediato) como padrão, com alternância para agendamento futuro sob demanda.
   - Atualizados tanto `src/ui/Atender.jsx` (demonstração/testes) quanto `src/ui/real/Atender.jsx` (produção real).
2. **Correção no Backend Java (Spring Boot 3.4 / JDK 21):**
   - **NPE em Endpoints Públicos:** Corrigido `LojaRepository.java` onde `jdbc.query(...).stream().findFirst()` disparava `NullPointerException` interno do `Optional.of(null)` quando campos de reCAPTCHA (`recaptcha_chave_site` / `recaptcha_segredo`) retornavam `NULL` do PostgreSQL.
   - **Constraint de Clientes:** Em `V47__modo_homologacao.sql` e `ClienteService.java`, preservado o nome do índice único `cliente_telefone_nome_uq` com índice parcial `WHERE (teste = false)`, mantendo a mensagem exata `"Já existe um cliente com esse nome e telefone."`.
   - **Asserções e Assinaturas de Testes:** Corrigido `AvaliacoesTest.java` (campo raiz `$.loja`, nome da loja `"Offbox Barbearia"` e inversão dos parâmetros `ip` e `corpo` em `pubPost`).
3. **Esteira de CI e Deploy:**
   - Run `41524160444` (CI principal): **8 jobs verdes** (`testes`, `navegador 1/2/3`, `barbearia 1/2`, `auditoria`, `backend` com todos os 487 testes aprovados, `deploy` do frontend).
   - Run `41524764456` (Deploy da API): Imagem Docker compilada, enviada ao GHCR, contêineres reiniciados na VPS e rotas públicas validadas.
   - **Smoke Test Real Externo:** Executado em `https://apex.agendz.io/` com confirmação dos marcadores no HTML (`atender-v-porte-`, `pub-porte`, `pub-passos`, `atender-agora`).

---

## 🛠️ 3. Comandos Úteis para o Codex

### Git & Branches
```powershell
cd C:\git\agendz-workspace\agendz
git status
git pull origin main
```

### Testes do Frontend
```powershell
cd C:\git\agendz-workspace\agendz
npm test                        # Testes de domínio, regras e estáticos
npm run build                   # Build do app de demonstração
node build.mjs --real           # Build do site publicado com API real
```

### Testes do Backend (JDK 21)
```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
cd C:\git\agendz-workspace\agendz\backend
mvn test-compile                # Compilação rápida
```

### Acompanhar CI/CD e Deploy
```powershell
cd C:\git\agendz-workspace\agendz
gh run list --limit 5
gh run watch <RUN_ID>
```

---

## 📌 4. Diretrizes Operacionais para as Próximas Tarefas
1. **Prioridade de Modelo:** Usar sempre o Codex / OpenAI para arquitetura e codificação.
2. **Ambiente Real x Demonstração:**
   - Telas de simulação ficam em `src/ui/`.
   - Telas do site real conectado ao backend ficam em `src/ui/real/`.
   - Sempre que alterar uma tela de fluxo, garanta a consistência entre ambos.
3. **Deploy Seguro:**
   - Merge na branch `main` dispara o deploy automático via GitHub Actions.
   - Aguarde os jobs com `gh run watch` e finalize sempre com verificação externa na URL da VPS (`https://apex.agendz.io/`).
