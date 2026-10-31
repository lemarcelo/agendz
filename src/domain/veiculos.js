/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Veículos do cliente: porte (que define preço e duração do serviço) e placa (antiga ABC-1234 ou Mercosul ABC1D23), sempre validada.
// Sem consulta de placa em base externa: a validação é só de formato.
import { limparTexto } from './texto.js';

// Portes da loja (v122): o dono cadastra em Estabelecimento > Portes. Sem cadastro valem os cinco de fábrica. `PORTES` (todos os ids, ativos ou não, na ordem do dono),
// `ROTULO_PORTE` e `EXEMPLO_PORTE` são atualizados NO LUGAR por `definirPortes` (quem importou continua vendo a lista atual); `portesAtivos()` é o que se oferece para escolher.
export const PORTE_PADRAO = 'medio'; // nunca sai nem desativa: é o porte de quem não escolheu e o preço de quem não tem preço no porte
export const PORTES_DE_FABRICA = [
  { id: 'pequeno', nome: 'Pequeno', exemplo: 'Ex.: Mobi, Kwid, Up', ativo: true, fator: 0.9 },
  { id: 'medio', nome: 'Médio', exemplo: 'Ex.: Onix, HB20, Corolla', ativo: true, fator: 1 },
  { id: 'grande', nome: 'Grande', exemplo: 'Ex.: Spin, Compass sedã grande, Van', ativo: true, fator: 1.2 },
  { id: 'suv', nome: 'SUV', exemplo: 'Ex.: Creta, T-Cross, Tracker', ativo: true, fator: 1.3 },
  { id: 'pickup', nome: 'Pickup', exemplo: 'Ex.: Strada, Hilux, S10', ativo: true, fator: 1.4 },
];
// v124: cada porte tem um FATOR que multiplica o preço base do serviço (o do Médio, fator 1 fixo). Gravação antiga sem fator vale o de fábrica do id (ou 1).
export const FATOR_MIN = 0.1;
export const FATOR_MAX = 10;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fatorPadrao = (id) => (id === PORTE_PADRAO ? 1 : PORTES_DE_FABRICA.find((f) => f.id === id)?.fator ?? 1);
const fatorLido = (x) => (x.id === PORTE_PADRAO ? 1 : Number.isFinite(x.fator) && x.fator >= FATOR_MIN && x.fator <= FATOR_MAX ? r2(x.fator) : fatorPadrao(x.id));
export const LIMITE_PORTES = 12;
export const PORTES = [];
export const ROTULO_PORTE = {};
export const EXEMPLO_PORTE = {};
let listaPortes = [];
export function definirPortes(lista) {
  const l = Array.isArray(lista) && lista.length ? lista : PORTES_DE_FABRICA;
  listaPortes = l.map((x) => ({ id: x.id, nome: x.nome, exemplo: x.exemplo || '', ativo: x.ativo !== false, fator: fatorLido(x) }));
  PORTES.length = 0; PORTES.push(...listaPortes.map((x) => x.id));
  for (const k of Object.keys(ROTULO_PORTE)) delete ROTULO_PORTE[k];
  for (const k of Object.keys(EXEMPLO_PORTE)) delete EXEMPLO_PORTE[k];
  for (const x of listaPortes) { ROTULO_PORTE[x.id] = x.nome; EXEMPLO_PORTE[x.id] = x.exemplo; }
}
definirPortes(null);
export const listaDePortes = () => listaPortes.map((x) => ({ ...x }));
export const fatorDoPorte = (porte) => listaPortes.find((x) => x.id === porte)?.fator ?? 1;
// Preço do serviço no porte: o específico (definido no serviço) ou preço base × fator do porte, em 2 casas. `base` = preço do Médio.
export function precoNoPorte(base, especifico, porte) {
  const e = especifico === null || especifico === undefined || especifico === '' ? NaN : Number(especifico);
  if (Number.isFinite(e) && e >= 0) return r2(e);
  const b = Number(base);
  if (!Number.isFinite(b)) return 0;
  return r2(b * (porte === PORTE_PADRAO ? 1 : fatorDoPorte(porte)));
}
export const portesAtivos = () => listaPortes.filter((x) => x.ativo);
export const porteValido = (p) => typeof p === 'string' && PORTES.includes(p); // conhecido (para ler o que já existe)
// Portes para o campo de escolha: os ativos e, se o valor atual for de um porte já desativado, ele também (para não sumir da tela).
export const portesParaEscolher = (atual) => listaPortes.filter((x) => x.ativo || x.id === atual);
export const porteAtivo = (p) => typeof p === 'string' && listaPortes.some((x) => x.id === p && x.ativo); // para escolher um porte agora
// Valor do porte numa tabela de preços/durações: o do porte, senão o do médio, senão `padrao`.
export const valorDoPorte = (tabela, porte, padrao) => {
  const v = tabela && typeof tabela === 'object' ? tabela : {};
  const n = (k) => (Number.isFinite(Number(v[k])) && v[k] !== null && v[k] !== '' ? Number(v[k]) : null);
  return n(porte) ?? n(PORTE_PADRAO) ?? padrao;
};

// Lista de portes vinda do dono (Estabelecimento > Portes). Devolve { ok, portes } ou { ok: false, erro }. Id novo (vazio) é gerado por `novoId`.
// Regras: 1 a 12 portes, nome 2–20 sem repetir (sem diferenciar maiúsculas), exemplo até 60, o médio fica e fica ativo, ao menos um ativo.
export function sanearPortes(entrada, novoId) {
  if (!Array.isArray(entrada) || entrada.length < 1 || entrada.length > LIMITE_PORTES) return { ok: false, erro: `Cadastre de 1 a ${LIMITE_PORTES} portes.` };
  const vistos = new Set(); const ids = new Set(); const saida = [];
  for (const x of entrada) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, erro: 'Porte inválido.' };
    if (x.id !== undefined && x.id !== null && x.id !== '' && !(typeof x.id === 'string' && /^[a-z0-9-]{2,24}$/.test(x.id))) return { ok: false, erro: 'Porte inválido.' };
    if (typeof x.nome !== 'string' || (x.exemplo !== undefined && x.exemplo !== null && typeof x.exemplo !== 'string') || (x.ativo !== undefined && typeof x.ativo !== 'boolean')) return { ok: false, erro: 'Porte inválido.' };
    const nome = limparTexto(x.nome, 20).trim();
    if (nome.length < 2) return { ok: false, erro: 'O nome do porte tem de 2 a 20 letras.' };
    if (vistos.has(nome.toLowerCase())) return { ok: false, erro: `O porte “${nome}” aparece duas vezes.` };
    vistos.add(nome.toLowerCase());
    const id = x.id || novoId();
    if (ids.has(id)) return { ok: false, erro: 'Porte repetido.' };
    ids.add(id);
    if (x.fator !== undefined && x.fator !== null && (typeof x.fator !== 'number' || !Number.isFinite(x.fator))) return { ok: false, erro: 'Porte inválido.' };
    let fator = x.fator === undefined || x.fator === null ? fatorPadrao(id) : r2(x.fator);
    if (id === PORTE_PADRAO) fator = 1; // o Médio é a base
    if (fator < FATOR_MIN || fator > FATOR_MAX) return { ok: false, erro: `O fator do porte ${nome} vai de 0,10 a 10.` };
    saida.push({ id, nome, exemplo: limparTexto(String(x.exemplo ?? ''), 60).trim(), ativo: x.ativo !== false, fator });
  }
  const medio = saida.find((x) => x.id === PORTE_PADRAO);
  if (!medio) return { ok: false, erro: 'O porte padrão (Médio) não pode ser retirado; você pode mudar o nome dele.' };
  if (!medio.ativo) return { ok: false, erro: 'O porte padrão (Médio) não pode ser desativado.' };
  return { ok: true, portes: saida };
}
export const LIMITE_VEICULOS = 10;

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
