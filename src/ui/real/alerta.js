/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Efeitos do aviso de agendamento novo: bipe (Web Audio, sem arquivo de som), vibração e as escolhas guardadas no aparelho. Tudo "melhor esforço":
// navegador sem som, sem vibração ou com o armazenamento bloqueado simplesmente não faz aquilo, sem erro na tela.
// O navegador só libera o som depois de um toque da pessoa na página: `liberarSom` espera o primeiro toque ou tecla. Não importa `api.js` (tests/estatico.test.mjs).
import { BIPE, VIBRACAO, chavePrefs, sanearPrefs } from '../../domain/notificacao.js';

let contexto = null;
let escutando = false;

function criarContexto() {
  if (contexto) return contexto;
  const Classe = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Classe) return null;
  try { contexto = new Classe(); } catch { contexto = null; }
  return contexto;
}

// Chame uma vez ao entrar no painel: no primeiro toque/tecla o som fica liberado para os avisos seguintes.
export function liberarSom() {
  if (escutando || !globalThis.document) return;
  escutando = true;
  const abrir = () => {
    const c = criarContexto();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    for (const e of ['pointerdown', 'keydown', 'touchstart']) globalThis.document.removeEventListener(e, abrir, true);
  };
  for (const e of ['pointerdown', 'keydown', 'touchstart']) globalThis.document.addEventListener(e, abrir, { capture: true, passive: true });
}

// Três bipes curtos e baixos. Devolve true se chegou a agendá-los (som liberado e suportado).
export function tocarBipe(config = BIPE) {
  const c = criarContexto();
  if (!c || c.state !== 'running') return false;
  try {
    const t0 = c.currentTime + 0.02;
    for (let i = 0; i < config.vezes; i++) {
      const ini = t0 + (i * (config.duracaoMs + config.pausaMs)) / 1000;
      const fim = ini + config.duracaoMs / 1000;
      const osc = c.createOscillator(); const ganho = c.createGain();
      osc.type = 'sine'; osc.frequency.value = config.freq;
      ganho.gain.setValueAtTime(0.0001, ini);
      ganho.gain.exponentialRampToValueAtTime(config.volume, ini + 0.015); // sobe e desce rápido: sem estalo
      ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
      osc.connect(ganho); ganho.connect(c.destination);
      osc.start(ini); osc.stop(fim + 0.02);
    }
    return true;
  } catch { return false; }
}

export function vibrar() {
  try { return typeof globalThis.navigator?.vibrate === 'function' ? globalThis.navigator.vibrate(VIBRACAO) === true : false; } catch { return false; }
}

export function lerPrefs(lojaSlug, usuarioId) {
  try { return sanearPrefs(JSON.parse(globalThis.localStorage.getItem(chavePrefs(lojaSlug, usuarioId)) || 'null')); } catch { return sanearPrefs(null); }
}

export function gravarPrefs(lojaSlug, usuarioId, prefs) {
  const limpas = sanearPrefs(prefs);
  try { globalThis.localStorage.setItem(chavePrefs(lojaSlug, usuarioId), JSON.stringify(limpas)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  return limpas;
}
