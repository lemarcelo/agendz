/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:c3cbe21acc */
// Logo e cor do tema. Tudo aqui é puro (sem navegador): valida a imagem recebida, acha as duas cores dominantes e monta o degradê do app.
// O degradê vai só no topo (com o menu), nos botões principais e no destaque (--acento); fundos e cartões continuam neutros. O texto sobre o degradê
// é escolhido sozinho (branco ou escuro) e as pontas escurecem ou clareiam até o contraste chegar a 4,5. As cores de status
// (verde, vermelho, laranja, azul) continuam fixas, porque significam coisas (confirmado, cancelado, reagendado).

import { fundoAtivo, temaPadraoAtivo } from './tipos.js';

export const LOGO_MAX = 140000; // caracteres do data URL (≈ 100 KB de imagem); abaixo do teto de crescimento por operação da API
const MAGIA = {
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

// Só PNG, JPEG ou WebP em base64, com o cabeçalho do arquivo batendo com o tipo declarado. SVG fica de fora de propósito.
export function logoValida(url) {
  if (typeof url !== 'string' || url.length > LOGO_MAX) return false;
  const m = url.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m || m[2].length < 24) return false;
  try {
    const bin = atob(m[2].slice(0, 24));
    const b = Array.from(bin, (c) => c.charCodeAt(0));
    return MAGIA[m[1]](b);
  } catch { return false; }
}
export const corValida = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);

// ---------- cores ----------
export function hexParaRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export const rgbParaHex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export function rgbParaHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslParaHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbParaHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const lum = (hex) => { const [r, g, b] = hexParaRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function contraste(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// Duas cores dominantes de uma imagem (pixels RGBA). Ignora transparente, quase branco e quase preto; prefere as mais saturadas e frequentes.
// A segunda é a mais forte com matiz diferente (≥ 30°); se a logo tem uma cor só, ela é uma variação mais clara ou mais escura da primeira.
// Logo só em preto, branco e cinza devolve o cinza médio e uma variação dele (o degradê fica neutro). Sem pixel útil, devolve null.
export function coresDominantes(rgba) {
  const baldes = Array.from({ length: 24 }, () => ({ peso: 0, r: 0, g: 0, b: 0 }));
  let n = 0, cinza = 0, cr = 0, cg = 0, cb = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
    if (a < 128) continue;
    const [h, s, l] = rgbParaHsl(r, g, b);
    if (l > 0.93 || l < 0.07) continue;
    n++;
    if (s < 0.18) { cinza++; cr += r; cg += g; cb += b; continue; }
    const k = baldes[Math.floor(h / 15) % 24];
    const peso = s * (1 - Math.abs(2 * l - 1) * 0.5);
    k.peso += peso; k.r += r * peso; k.g += g * peso; k.b += b * peso;
  }
  const cor = (k) => rgbParaHex(k.r / k.peso, k.g / k.peso, k.b / k.peso);
  const ordem = baldes.map((k, i) => ({ k, i })).filter((x) => x.k.peso >= n * 0.02 && x.k.peso > 0).sort((a, b) => b.k.peso - a.k.peso);
  if (ordem.length) {
    const c1 = cor(ordem[0].k);
    const dist = (a, b) => Math.min(Math.abs(a - b), 24 - Math.abs(a - b));
    const o2 = ordem.find((x) => dist(x.i, ordem[0].i) >= 2 && x.k.peso >= ordem[0].k.peso * 0.15);
    return [c1, o2 ? cor(o2.k) : variacao(c1)];
  }
  if (cinza) { const c1 = rgbParaHex(cr / cinza, cg / cinza, cb / cinza); return [c1, variacao(c1)]; }
  return null;
}
export const corDominante = (rgba) => { const c = coresDominantes(rgba); return c ? c[0] : null; };
function variacao(hex) {
  const [h, s, l] = rgbParaHsl(...hexParaRgb(hex));
  return hslParaHex(h + 14, s, l > 0.5 ? l - 0.2 : l + 0.2);
}

// Ajusta a luminosidade até a cor passar no contraste pedido contra `fundo` (claro: escurece; escuro: clareia).
function comContraste(h, s, l, fundo, minimo, passo) {
  let hex = hslParaHex(h, s, l);
  for (let i = 0; i < 60 && contraste(hex, fundo) < minimo; i++) { l += passo; hex = hslParaHex(h, s, l); }
  return hex;
}

// ---------- cor do tema ----------
// Paletas prontas (duas cores cada). "padrao" (sem CSS extra) e "logo" (as duas cores da logo) completam a lista.
export const PALETAS = [
  { id: 'ambar', nome: 'Âmbar', cores: ['#b45309', '#f2a93b'] },
  { id: 'petroleo', nome: 'Petróleo', cores: ['#0f4c5c', '#2a9d8f'] },
  { id: 'vinho', nome: 'Vinho', cores: ['#7f1d3a', '#c2415d'] },
  { id: 'grafite', nome: 'Grafite', cores: ['#2b2f36', '#667085'] },
  { id: 'oliva', nome: 'Oliva', cores: ['#4d5a1e', '#8fa13f'] },
  { id: 'azul-noite', nome: 'Azul-noite', cores: ['#16225c', '#3b5bdb'] },
];
export const TEMAS_VALIDOS = ['padrao', 'logo', ...PALETAS.map((x) => x.id)];

// As duas cores do tema escolhido, ou null (padrão, logo sem cor, id desconhecido).
export function coresDoTema(estab) {
  const id = estab && estab.temaCor;
  const pal = PALETAS.find((x) => x.id === id);
  if (pal) return pal.cores;
  if (id === 'logo' && corValida(estab.corTema)) return [estab.corTema, corValida(estab.corTema2) ? estab.corTema2 : variacao(estab.corTema)];
  return null;
}

const ESCURO_FG = '#16181a';
const rgba = (hex, a) => { const [r, g, b] = hexParaRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
// Pontas do degradê dentro da faixa de luminosidade pedida, com o texto (branco ou escuro) que lê melhor nas duas e contraste ≥ 4,5.
function pintar(c1, c2, { lMin, lMax, sMax = 0.85 }) {
  const fixa = ([h, s, l]) => [h, Math.min(s, sMax), Math.max(lMin, Math.min(lMax, l))];
  let a = fixa(rgbParaHsl(...hexParaRgb(c1))), b = fixa(rgbParaHsl(...hexParaRgb(c2)));
  if (Math.abs(a[2] - b[2]) < 0.08) b = [b[0], b[1], a[2] + 0.08 <= lMax ? a[2] + 0.08 : a[2] - 0.08]; // pontas sempre diferentes
  const hex = ([h, s, l]) => hslParaHex(h, s, l);
  const pior = (fg) => Math.min(contraste(hex(a), fg), contraste(hex(b), fg));
  const fg = pior('#ffffff') >= pior(ESCURO_FG) ? '#ffffff' : ESCURO_FG;
  const passo = fg === '#ffffff' ? -0.02 : 0.02;
  for (let i = 0; i < 45 && pior(fg) < 4.5; i++) { a = [a[0], a[1], a[2] + passo]; b = [b[0], b[1], b[2] + passo]; }
  return { a: hex(a), b: hex(b), fg };
}
function tokensDoModo(c1, c2, escuro) {
  const topo = pintar(c1, c2, escuro ? { lMin: 0.1, lMax: 0.32, sMax: 0.62 } : { lMin: 0.1, lMax: 0.88 });
  const btn = pintar(c1, c2, escuro ? { lMin: 0.52, lMax: 0.82 } : { lMin: 0.1, lMax: 0.88 });
  const [h, s, l] = rgbParaHsl(...hexParaRgb(c1));
  const sb = Math.min(s, 0.8);
  return {
    '--tema-topo': `linear-gradient(100deg, ${topo.a}, ${topo.b})`,
    '--tema-topo-fg': topo.fg,
    '--tema-topo-suave': rgba(topo.fg, 0.8),
    '--tema-topo-hover': rgba(topo.fg, 0.16),
    '--tema-btn': `linear-gradient(135deg, ${btn.a}, ${btn.b})`,
    '--tema-btn-fg': btn.fg,
    '--tema-btn-borda': 'transparent',
    '--tema-btn-aro': rgba(btn.b, escuro ? 0.55 : 0.4), // aro suave da cor do botão (link do cliente)
    '--acento': escuro ? comContraste(h, sb, Math.max(l, 0.58), fundoAtivo(true), 4.5, 0.01) : comContraste(h, sb, Math.min(l, 0.46), fundoAtivo(false), 3, -0.01),
  };
}
// Tokens do degradê para o tema claro e o escuro (null quando o tema é o padrão).
export function paletaDoTema(estab) {
  const c = coresDoTema(estab);
  if (!c) return null;
  return { claro: tokensDoModo(c[0], c[1], false), escuro: tokensDoModo(c[0], c[1], true) };
}

const bloco = (tokens) => Object.entries(tokens).map(([k, v]) => `${k}: ${v};`).join(' ');
// CSS pronto para a tag <style>. Só entra texto já validado (cor #rrggbb, id de lista fixa e data URL base64), então não há como sair do bloco.
export function cssDaMarca(estab) {
  const out = [];
  const cores = paletaDoTema(estab);
  const logo = estab && logoValida(estab.logo) ? estab.logo : null;
  if (!cores && !logo) return '';
  if (temaPadraoAtivo() === 'auto') {
    // Tipo que segue o sistema: o claro fica em :root, o escuro entra pelo sistema ou quando o usuário escolhe (data-theme="dark").
    out.push(`:root { ${cores ? bloco(cores.claro) : ''} ${logo ? `--logo-fundo: url("${logo}"); --logo-opac: .075;` : ''} }`);
    if (cores) {
      out.push(`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${bloco(cores.escuro)} --logo-opac: .1; } }`);
      out.push(`:root[data-theme="dark"] { ${bloco(cores.escuro)} --logo-opac: .1; }`);
    } else if (logo) {
      out.push('@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --logo-opac: .1; } }');
      out.push(':root[data-theme="dark"] { --logo-opac: .1; }');
    }
  } else {
    // O escuro é o padrão (fica em :root); o claro entra só quando o usuário escolhe (data-theme="light"). Não segue o sistema.
    out.push(`:root { ${cores ? bloco(cores.escuro) : ''} ${logo ? `--logo-fundo: url("${logo}"); --logo-opac: .1;` : ''} }`);
    if (cores) out.push(`:root[data-theme="light"] { ${bloco(cores.claro)} --logo-opac: .075; }`);
    else if (logo) out.push(':root[data-theme="light"] { --logo-opac: .075; }');
  }
  return out.join('\n');
}
