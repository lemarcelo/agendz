/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Teste de fumaça contra o site REAL (só leitura: entra e olha as telas; nunca grava nada). Rodado pelo workflow `smoke-producao`, que cria um usuário de
// fumaça temporário na VPS (deploy/fumaca.sh) e o apaga no final. Variáveis: SMOKE_URL (https://loja.dominio), SMOKE_USUARIO, SMOKE_SENHA, SMOKE_IP (opcional:
// IP da VPS, usado se o DNS público falhar). Nada disso vai para log ou captura de tela.
// 1) diagnóstico de rede (DNS em 8.8.8.8 e 1.1.1.1, porta 443, HTTPS); 2) por módulo do menu, UMA tela, em celular (390 px) e computador (1280 px), claro e
// escuro; 3) relatório só por exceção (erro de console, resposta 4xx/5xx, requisição falha, rolagem lateral, controle fora da tela) em smoke-relatorio.json/.md.
import { chromium } from 'playwright';
import dns from 'node:dns';
import net from 'node:net';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';

const URL_SITE = (process.env.SMOKE_URL || '').replace(/\/$/, '');
const USUARIO = process.env.SMOKE_USUARIO || '';
const SENHA = process.env.SMOKE_SENHA || '';
const IP = /^\d{1,3}(\.\d{1,3}){3}$/.test(process.env.SMOKE_IP || '') ? process.env.SMOKE_IP : '';
if (!/^https:\/\/[a-z0-9.-]+$/.test(URL_SITE) || !USUARIO || !SENHA) { console.error('Faltam SMOKE_URL (https), SMOKE_USUARIO ou SMOKE_SENHA.'); process.exit(2); }
const HOST = new URL(URL_SITE).hostname;
const PAUSA = 1000; // 1 s entre interações: não sobrecarrega a VPS nem dispara bloqueio
const pausa = (p) => p.waitForTimeout(PAUSA);
mkdirSync('shots-smoke', { recursive: true });

const relatorio = { url: URL_SITE, rede: {}, telasAnalisadas: 0, falhas: [], avisos: [] };
const falha = (onde, o) => { relatorio.falhas.push({ onde, ...o }); console.log('✗', onde, o.tipo, o.detalhe); };

// ---------------------------------------------------------------- 1. rede
async function resolverCom(servidor) {
  const r = new dns.promises.Resolver(); r.setServers([servidor]);
  try { return await Promise.race([r.resolve4(HOST), new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 5000))]); } catch (e) { return String(e.code || e.message); }
}
const porta = (host, n = 443) => new Promise((ok) => { const s = net.connect({ host, port: n, timeout: 6000 }); s.on('connect', () => { s.destroy(); ok('aberta'); }); s.on('timeout', () => { s.destroy(); ok('tempo esgotado (firewall/UFW?)'); }); s.on('error', (e) => ok(e.code === 'ECONNREFUSED' ? 'recusada (serviço parado?)' : String(e.code || e.message))); });
async function https(alvo) { try { const r = await fetch(alvo, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); return `HTTP ${r.status}`; } catch (e) { return `falhou: ${String(e.cause?.code || e.message).slice(0, 80)}`; } }

relatorio.rede.google = await resolverCom('8.8.8.8');
relatorio.rede.cloudflare = await resolverCom('1.1.1.1');
const resolvido = [relatorio.rede.google, relatorio.rede.cloudflare].find((r) => Array.isArray(r));
let usarIp = false;
if (!resolvido) {
  relatorio.rede.pingSaida = await porta('8.8.8.8', 53); // saída geral da máquina
  if (IP) { usarIp = true; relatorio.rede.fallback = `DNS não resolveu; usando o IP da VPS (${IP}) com Host ${HOST}`; }
}
const destino = resolvido ? resolvido[0] : usarIp ? IP : HOST;
relatorio.rede.porta443 = await porta(destino);
relatorio.rede.https = await https(URL_SITE);
console.log('rede:', JSON.stringify(relatorio.rede));
const redeOk = relatorio.rede.porta443 === 'aberta' && /^HTTP [23]/.test(relatorio.rede.https);
if (!redeOk) falha('rede', { tipo: 'conexão', detalhe: `porta 443: ${relatorio.rede.porta443}; HTTPS: ${relatorio.rede.https}` });

// ---------------------------------------------------------------- 2. telas
async function varrer() {
  const b = await chromium.launch({ args: usarIp ? [`--host-resolver-rules=MAP ${HOST} ${IP}`] : [] });
  try {
    for (const vp of [{ n: 'celular', width: 390, height: 780 }, { n: 'pc', width: 1280, height: 860 }]) {
      for (const tema of ['dark', 'light']) {
        const touch = vp.width < 700;
        const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
        const p = await ctx.newPage(); p.setDefaultTimeout(15000);
        let tela = 'login'; const onde = () => `${vp.n}/${tema}/${tela}`;
        // monitoramento local: nada de HTML vai para o relatório, só o resumo da falha
        p.on('pageerror', (e) => falha(onde(), { tipo: 'erro de página', detalhe: e.message.slice(0, 200) }));
        p.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) falha(onde(), { tipo: 'console', detalhe: m.text().slice(0, 200) }); });
        p.on('response', (r) => { const s = r.status(); if (s >= 400 && !/favicon|fonts\.g/.test(r.url())) falha(onde(), { tipo: `HTTP ${s}`, detalhe: `${r.request().method()} ${new URL(r.url()).pathname}` }); });
        p.on('requestfailed', (r) => { if (!/fonts\.g/.test(r.url())) falha(onde(), { tipo: 'requisição falhou', detalhe: `${new URL(r.url()).pathname} (${r.failure()?.errorText})` }); });
        p.on('dialog', async (d) => { falha(onde(), { tipo: 'diálogo do navegador', detalhe: d.message().slice(0, 100) }); await d.dismiss(); });
        await p.addInitScript((t) => { try { localStorage.setItem('tema', t); } catch { /* sem armazenamento */ } }, tema);
        try {
          await p.goto(URL_SITE);
          await p.getByTestId('login-id').fill(USUARIO);
          await p.getByTestId('login-senha').fill(SENHA);
          await pausa(p);
          await p.getByTestId('login-entrar').click();
          // O dono de uma loja que ainda não concluiu o assistente de início cai no assistente (testid `pa`), não no menu: isso é o esperado no primeiro acesso.
          const chegou = await Promise.race([
            p.locator('[data-testid^="nav-"]').first().waitFor().then(() => 'menu'),
            p.getByTestId('pa').waitFor().then(() => 'assistente'),
          ]);
          if (chegou === 'assistente') { relatorio.avisos.push(`${onde()}: o assistente de início ainda está aberto nesta loja (o dono cai nele ao entrar)`); await ctx.close(); continue; }
        } catch (e) {
          // diagnóstico sem segredo: só o que está visível na tela depois do login (títulos e ids de teste)
          const visto = await p.evaluate(() => ({ h: [...document.querySelectorAll('h1,h2,[role=alert]')].map((e) => (e.textContent || '').trim().slice(0, 60)).slice(0, 3), ids: [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).slice(0, 6) })).catch(() => ({}));
          falha(onde(), { tipo: 'login', detalhe: `${String(e.message).split('\n')[0]} · tela: ${JSON.stringify(visto)}` }); await ctx.close(); continue;
        }
        const ids = await p.locator('[data-testid^="nav-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
        for (const id of [...new Set(ids)]) {
          tela = id;
          try {
            await pausa(p);
            await p.getByTestId(id).click();
            await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
            await p.waitForTimeout(400);
            const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
            if (sw > iw) falha(onde(), { tipo: 'rolagem horizontal', detalhe: `${sw} > ${iw}` });
            const fora = await p.evaluate(() => [...document.querySelectorAll('button, a.btn, input, select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); }).length);
            if (fora) falha(onde(), { tipo: 'controle fora da tela', detalhe: `${fora} controle(s)` });
            // interação sem gravar: na Agenda abre o Atender e fecha sem salvar (o formulário tem de aparecer)
            if (id === 'nav-agenda' && await p.getByTestId('atender-abrir').count()) {
              await pausa(p);
              if (await p.getByTestId('atender-abrir').isEnabled()) {
                await p.getByTestId('atender-abrir').click();
                if (!(await p.locator('.atender-real').first().waitFor({ timeout: 5000 }).then(() => true, () => false))) falha(onde(), { tipo: 'interação', detalhe: 'o Atender não abriu' });
                await p.screenshot({ path: `shots-smoke/${vp.n}-${tema}-atender.png`, fullPage: true });
                await p.getByTestId(id).click(); // volta à lista sem salvar
              }
            }
            await p.screenshot({ path: `shots-smoke/${vp.n}-${tema}-${id}.png`, fullPage: true });
            relatorio.telasAnalisadas++;
          } catch (e) { falha(onde(), { tipo: 'tela', detalhe: String(e.message).split('\n')[0] }); }
        }
        await ctx.close();
      }
    }
  } finally { await b.close(); }
}
try { if (redeOk) await varrer(); } catch (e) { falha('execução', { tipo: 'exceção', detalhe: String(e.message).slice(0, 200) }); }

// ---------------------------------------------------------------- 3. relatório (só exceções + resumo)
const unicas = [...new Map(relatorio.falhas.map((f) => [`${f.onde}|${f.tipo}|${f.detalhe}`, f])).values()];
relatorio.falhas = unicas;
relatorio.avisos = [...new Set(relatorio.avisos)];
writeFileSync('smoke-relatorio.json', JSON.stringify(relatorio, null, 1));
const md = [`## Fumaça no site real: ${URL_SITE}`, '', `- Rede: Google DNS \`${[].concat(relatorio.rede.google).join(',')}\` · Cloudflare \`${[].concat(relatorio.rede.cloudflare).join(',')}\` · porta 443: ${relatorio.rede.porta443} · ${relatorio.rede.https}${relatorio.rede.fallback ? ` · ${relatorio.rede.fallback}` : ''}`,
  `- Telas analisadas: ${relatorio.telasAnalisadas} · falhas: ${unicas.length}`, ...relatorio.avisos.map((a) => `- Aviso: ${a}`), '', ...(unicas.length ? ['| Onde | Tipo | Detalhe |', '|---|---|---|', ...unicas.map((f) => `| ${f.onde} | ${f.tipo} | ${String(f.detalhe).replace(/\|/g, '/')} |`)] : ['Nenhuma falha.'])].join('\n');
writeFileSync('smoke-relatorio.md', md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
// anotações do GitHub (aparecem no job e na API de anotações, que é o que o agente de trabalho consegue ler)
if (process.env.GITHUB_ACTIONS) for (const a of relatorio.avisos.slice(0, 8)) console.log(`::warning title=Fumaça aviso::${a}`);
if (process.env.GITHUB_ACTIONS) for (const f of unicas.slice(0, 40)) console.log(`::error title=Fumaça ${f.tipo}::${f.onde} — ${String(f.detalhe).replace(/[\r\n%]/g, ' ').slice(0, 300)}`);
process.exit(unicas.length ? 1 : 0);
