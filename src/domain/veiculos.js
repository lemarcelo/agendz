/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Veículos do cliente: porte (que define preço e duração do serviço) e placa (antiga ABC-1234 ou Mercosul ABC1D23), sempre validada.
// Sem consulta de placa em base externa: a validação é só de formato.
import { limparTexto } from './texto.js';

export const PORTES = ['pequeno', 'medio', 'grande', 'suv', 'pickup'];
export const ROTULO_PORTE = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande', suv: 'SUV', pickup: 'Pickup' };
export const EXEMPLO_PORTE = { pequeno: 'Ex.: Mobi, Kwid, Up', medio: 'Ex.: Onix, HB20, Corolla', grande: 'Ex.: Spin, Compass sedã grande, Van', suv: 'Ex.: Creta, T-Cross, Tracker', pickup: 'Ex.: Strada, Hilux, S10' };
export const PORTE_PADRAO = 'medio';
export const LIMITE_VEICULOS = 10;
export const porteValido = (p) => typeof p === 'string' && PORTES.includes(p);

const ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
// Maiúsculas, sem espaço nem hífen. Qualquer outro símbolo continua lá e faz a placa ser recusada (nunca é "limpo" até virar válido).
export const normalizarPlaca = (s) => (typeof s === 'string' && s.length <= 16 ? s.toUpperCase().replace(/[\s-]/g, '') : '');
export function tipoPlaca(s) {
  const p = normalizarPlaca(s);
  return ANTIGA.test(p) ? 'antiga' : MERCOSUL.test(p) ? 'mercosul' : null;
}
export const placaValida = (s) => tipoPlaca(s) !== null;
// Antiga com hífen (ABC-1234); Mercosul junta (ABC1D23). Placa inválida volta como veio, só em maiúsculas.
export function formatarPlaca(s) {
  const p = normalizarPlaca(s);
  return tipoPlaca(p) === 'antiga' ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}
// Chave para comparar placas (a antiga com e sem hífen é a mesma).
export const chavePlaca = normalizarPlaca;

// Veículo vindo de fora (formulário, link, WhatsApp). Devolve { ok, veiculo } ou { ok: false, erro }. Marca e cor são opcionais; placa, modelo e porte, não.
export function limparVeiculo(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, erro: 'Informe o veículo.' };
  for (const k of ['placa', 'marca', 'modelo', 'cor']) if (v[k] !== undefined && v[k] !== null && typeof v[k] !== 'string') return { ok: false, erro: 'Dados do veículo inválidos.' };
  if (!placaValida(v.placa)) return { ok: false, erro: 'Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23).' };
  const modelo = limparTexto(String(v.modelo ?? ''), 40).trim();
  if (modelo.length < 2) return { ok: false, erro: 'Informe o modelo do veículo.' };
  if (!porteValido(v.porte)) return { ok: false, erro: 'Escolha o porte do veículo.' };
  return { ok: true, veiculo: { placa: formatarPlaca(v.placa), marca: limparTexto(String(v.marca ?? ''), 30).trim(), modelo, cor: limparTexto(String(v.cor ?? ''), 20).trim(), porte: v.porte } };
}

// ---------- veículo com campos opcionais (v121) ----------
// O dono decide em Estabelecimento > Regras (atendimento) e no link do cliente o que é obrigatório: `veiculo` (algum veículo escolhido/informado), `placa`, `modelo`, `porte`.
// O que for informado sempre é conferido (placa no formato, porte conhecido); o que não for exigido pode faltar. Sem porte, vale o médio (preço e duração do cadastro).
export const CAMPOS_VEICULO_EXIGIVEIS = ['veiculo', 'placa', 'modelo', 'porte'];
export const EXIGE_TUDO_DO_VEICULO = ['veiculo', 'placa', 'modelo', 'porte']; // regra antiga: quem não passa a lista continua exigindo tudo (chat, remarcação)
const vazioV = (x) => x === undefined || x === null || String(x).trim() === '';
export const veiculoInformado = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && ['placa', 'marca', 'modelo', 'cor', 'porte'].some((k) => !vazioV(v[k]));

// Devolve { ok, veiculo, completo }. `veiculo` é null quando nada foi informado e nada é exigido. `completo` = placa válida + modelo (pode ir ao cadastro do cliente);
// veículo incompleto vale só como "foto" do atendimento.
export function limparVeiculoComRegras(v, exigir = EXIGE_TUDO_DO_VEICULO) {
  const pede = (k) => exigir.includes(k);
  if (!veiculoInformado(v)) {
    if (pede('veiculo')) return { ok: false, erro: 'Escolha o veículo do atendimento.' };
    const falta = [['placa', 'Informe a placa do veículo.'], ['modelo', 'Informe o modelo do veículo.'], ['porte', 'Escolha o porte do veículo.']].find(([k]) => pede(k));
    return falta ? { ok: false, erro: falta[1] } : { ok: true, veiculo: null, completo: false };
  }
  for (const k of ['placa', 'marca', 'modelo', 'cor', 'porte']) if (v[k] !== undefined && v[k] !== null && typeof v[k] !== 'string') return { ok: false, erro: 'Dados do veículo inválidos.' };
  if (vazioV(v.placa) ? pede('placa') : !placaValida(v.placa)) return { ok: false, erro: vazioV(v.placa) ? 'Informe a placa do veículo.' : 'Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23).' };
  const modelo = limparTexto(String(v.modelo ?? ''), 40).trim();
  if (pede('modelo') ? modelo.length < 2 : modelo.length === 1) return { ok: false, erro: 'Informe o modelo do veículo.' };
  if (vazioV(v.porte) ? pede('porte') : !porteValido(v.porte)) return { ok: false, erro: 'Escolha o porte do veículo.' };
  const placa = vazioV(v.placa) ? '' : formatarPlaca(v.placa);
  return { ok: true, completo: !!placa && modelo.length >= 2, veiculo: { placa, marca: limparTexto(String(v.marca ?? ''), 30).trim(), modelo, cor: limparTexto(String(v.cor ?? ''), 20).trim(), porte: vazioV(v.porte) ? PORTE_PADRAO : v.porte } };
}

// "Honda Civic · prata · ABC1D23"
export const rotuloVeiculo = (v) => (v ? [[v.marca, v.modelo].filter(Boolean).join(' '), v.cor, v.placa].filter(Boolean).join(' · ') : '');
// Só o essencial para mensagens e cartões: "Civic ABC1D23"
export const resumoVeiculo = (v) => (v ? [v.modelo, v.placa].filter(Boolean).join(' ') : '');

// Foto do veículo no momento do agendamento (o cadastro pode mudar depois; o combinado não).
export const fotoDoVeiculo = (v) => ({ placa: v.placa, marca: v.marca || '', modelo: v.modelo, cor: v.cor || '', porte: v.porte });

// Procura o veículo de um cliente pela placa.
export const veiculoPorPlaca = (cliente, placa) => (cliente?.veiculos || []).find((x) => chavePlaca(x.placa) === chavePlaca(placa)) || null;
