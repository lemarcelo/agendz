// Catálogo "simples" para os testes de regras gerais (Pix, crédito, cupom, DDD, comissão…): preço e duração iguais em todos os portes,
// como era antes de existir porte. Os testes de porte, box e serviço de vários dias usam o catálogo de exemplo do Apex (reiniciar do store).
import { store, auth, servicos, agenda, publico, whatsapp } from '../src/services/api.js';

const SIMPLES = {
  's-lav-simples': { preco: 40, duracao: 40, intervalo: 10, antecedenciaH: 2, materiais: [{ materialId: 'mt-microfibra', qtd: 1 }, { materialId: 'mt-shampoo', qtd: 8 }] },
  's-lav-detalhada': { preco: 40, duracao: 40, intervalo: 10, antecedenciaH: 2, materiais: [{ materialId: 'mt-microfibra', qtd: 1 }, { materialId: 'mt-shampoo', qtd: 8 }] },
  's-higien-interna': { preco: 40, duracao: 40, intervalo: 10, antecedenciaH: 2, materiais: [{ materialId: 'mt-microfibra', qtd: 1 }, { materialId: 'mt-shampoo', qtd: 10 }] },
  's-lav-motor': { preco: 35, duracao: 40, intervalo: 5, antecedenciaH: 1, materiais: [{ materialId: 'mt-argila', qtd: 1 }, { materialId: 'mt-desengraxante', qtd: 15 }] },
  's-polimento-comercial': { preco: 35, duracao: 40, intervalo: 5, antecedenciaH: 1, materiais: [{ materialId: 'mt-argila', qtd: 1 }, { materialId: 'mt-desengraxante', qtd: 15 }, { materialId: 'mt-microfibra', qtd: 1 }] },
};

export function reiniciar() {
  store.reiniciar();
  assert(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  for (const [id, v] of Object.entries(SIMPLES)) {
    const s = store.getState().servicos.find((x) => x.id === id);
    const r = servicos.salvar({ id, nome: s.nome, codigo: s.codigo, ...v });
    assert(r.ok, JSON.stringify(r));
  }
  auth.logout();
}
function assert(ok, msg) { if (!ok) throw new Error(`helpers.reiniciar: ${msg || 'falhou'}`); }

// Veículo padrão: os testes de regra geral não se importam com o carro, só que exista um (médio, o porte de referência).
// Teste que olha o veículo, o porte ou o box passa os dados e não é alterado.
export const VEI = { placa: 'ABC1D23', marca: 'Honda', modelo: 'Civic', cor: 'Prata', porte: 'medio' };
const comVeiculo = (d) => (d && typeof d === 'object' && Array.isArray(d.servicoIds) && d.servicoIds.length && !d.veiculo && !d.veiculoId && !d.clienteId ? { ...d, veiculo: VEI } : d);
const comPorte = (d) => (d && typeof d === 'object' && d.porte === undefined ? { ...d, porte: 'medio' } : d);
const comVeiculoLink = (d) => (d && typeof d === 'object' && d.placa === undefined ? { ...d, placa: VEI.placa, modelo: VEI.modelo, porte: d.porte || 'medio' } : d);
function padrao(obj, nome, f) { const orig = obj[nome]; if (orig && !orig.__padrao) { obj[nome] = Object.assign((...a) => orig.call(obj, f(a[0]), ...a.slice(1)), { __padrao: true }); } }
padrao(agenda, 'atender', comVeiculo);
padrao(agenda, 'registrarLocal', comVeiculo);
padrao(publico, 'agendar', comVeiculoLink);
padrao(publico, 'horarios', comPorte);
padrao(publico, 'diasLivres', comPorte);
padrao(whatsapp, 'horariosLivres', comPorte);
padrao(whatsapp, 'profissionaisComHorario', comPorte);
padrao(whatsapp, 'agendar', (d) => (d && typeof d === 'object' && d.veiculoId === undefined && d.veiculo === undefined ? { ...d, veiculo: VEI } : d));
// Cliente com mais de um veículo (o Jon): o painel sempre manda qual; nos testes antigos vale o primeiro.
padrao(agenda, 'criar', (d) => {
  if (!d || typeof d !== 'object' || d.veiculo || d.veiculoId || !d.clienteId) return d;
  const c = store.getState().clientes.find((x) => x.id === d.clienteId);
  return c && (c.veiculos || []).length > 1 ? { ...d, veiculoId: c.veiculos[0].id } : d;
});
