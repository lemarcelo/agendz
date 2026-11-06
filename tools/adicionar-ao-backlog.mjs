import fs from 'fs';
import path from 'path';

/**
 * Utilitário de Automação de Backlog e Sessão do Agendz
 * 
 * Uso:
 *   node tools/adicionar-ao-backlog.mjs --json caminho/itens.json
 * ou programático importando { adicionarItensAoBacklog }
 */

const raiz = process.cwd();
const caminhoBacklog = path.join(raiz, 'docs', 'BACKLOG-FUTURO.md');
const caminhoSessao = path.resolve(raiz, '..', 'SESSAO.md');

export function adicionarItensAoBacklog(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error('Forneça uma lista de itens para adicionar.');
  }

  // 1. Processar docs/BACKLOG-FUTURO.md
  let backlog = fs.readFileSync(caminhoBacklog, 'utf8');
  
  // Achar último número no backlog
  const matchesBacklog = [...backlog.matchAll(/^(\d+)\.\s+\*\*/gm)];
  let proxNumBacklog = matchesBacklog.length > 0 
    ? Math.max(...matchesBacklog.map(m => parseInt(m[1], 10))) + 1 
    : 1;

  // 2. Processar ../SESSAO.md
  let sessao = fs.existsSync(caminhoSessao) ? fs.readFileSync(caminhoSessao, 'utf8') : null;
  let proxNumSessao = 1;
  if (sessao) {
    const matchesSessao = [...sessao.matchAll(/^\s*(\d+)\.\s+\*\*PROMPT:/gm)];
    proxNumSessao = matchesSessao.length > 0 
      ? Math.max(...matchesSessao.map(m => parseInt(m[1], 10))) + 1 
      : 1;
  }

  const adicionados = [];

  for (const item of itens) {
    const numB = item.numBacklog || proxNumBacklog++;
    const numS = item.numSessao || proxNumSessao++;

    const titulo = item.titulo.trim();
    const contexto = item.contexto?.trim() || '';
    const arquivos = item.arquivos?.trim() || '`agendz/src/ui/real/`';
    const comportamento = Array.isArray(item.comportamento)
      ? item.comportamento.map(c => `        - ${c}`).join('\n')
      : (item.comportamento || '').split('\n').map(l => `        - ${l.trim().replace(/^[-*]\s*/, '')}`).join('\n');
    const validacao = item.validacao?.trim() || 'Testes unitários e teste Playwright em 1366px e 390px.';

    // Texto para BACKLOG-FUTURO.md
    const blocoBacklog = `${numB}. **${titulo}**:\n` +
      (Array.isArray(item.resumoBacklog)
        ? item.resumoBacklog.map(r => `    - ${r}`).join('\n')
        : (item.resumoBacklog || contexto).split('\n').map(l => `    - ${l.trim().replace(/^[-*]\s*/, '')}`).join('\n')) +
      '\n\n';

    // Texto para SESSAO.md
    const blocoSessao = `  ${numS}. **PROMPT: ${titulo}**\n` +
      `      - **Contexto:** ${contexto}\n` +
      `      - **Arquivos-chave:** ${arquivos}\n` +
      `      - **Comportamento esperado:**\n${comportamento}\n` +
      `      - **Validação & Testes:** ${validacao}\n\n`;

    adicionados.push({ numB, numS, titulo, blocoBacklog, blocoSessao });
  }

  // Inserir no BACKLOG-FUTURO.md antes do primeiro `---` separador pós-fila
  if (!backlog.includes(itens[0].titulo)) {
    const blocoTotalBacklog = adicionados.map(a => a.blocoBacklog).join('');
    backlog = backlog.replace(/^---\s*$/m, `${blocoTotalBacklog}---`);
    fs.writeFileSync(caminhoBacklog, backlog, 'utf8');
    console.log(`[OK] BACKLOG-FUTURO.md atualizado (+${adicionados.length} itens).`);
  } else {
    console.log(`[INFO] Itens já parecem existir em BACKLOG-FUTURO.md.`);
  }

  // Inserir no SESSAO.md no final da seção de Prompts
  if (sessao) {
    let jaExiste = adicionados.some(a => sessao.includes(a.titulo));
    if (!jaExiste) {
      const blocoTotalSessao = adicionados.map(a => a.blocoSessao).join('');
      sessao = sessao.trimEnd() + '\n\n' + blocoTotalSessao.trimEnd() + '\n';
      fs.writeFileSync(caminhoSessao, sessao, 'utf8');
      console.log(`[OK] SESSAO.md atualizado (+${adicionados.length} itens).`);
    } else {
      console.log(`[INFO] Itens já parecem existir em SESSAO.md.`);
    }
  }

  return adicionados;
}

// Execução direta via CLI
const args = process.argv.slice(2);
if (args[0] === '--json' && args[1]) {
  const dados = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  adicionarItensAoBacklog(Array.isArray(dados) ? dados : [dados]);
}
