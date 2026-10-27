/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Pessoas de exemplo de cada loja no SITE PUBLICADO (build com domínio). São funções puras sobre o estado da seed; os ids (`u-…`) não mudam,
// só nome/apelido e a quantidade de pessoas. Regra do dono (26/10/2026): Apex e Offbox = Proprietário + Colaborador 1, 2 e 3; Dalforno = só o Alan (proprietário).
const clonar = (v) => JSON.parse(JSON.stringify(v));
const NOME_DONO = 'Proprietário';

// Renomeia, em todo o estado, as pessoas cujo id está em `nomes` ({ id: nome }): cadastro (nome e apelido) e `autor` dos registros.
function renomear(estado, nomes, apelidos = nomes) {
  const andar = (v) => {
    if (Array.isArray(v)) return v.forEach(andar);
    if (!v || typeof v !== 'object') return;
    if (typeof v.id === 'string' && nomes[v.id] && 'nome' in v) { v.nome = nomes[v.id]; if ('apelido' in v) v.apelido = apelidos[v.id]; }
    Object.values(v).forEach(andar);
  };
  andar(estado);
}

// Proprietário + Colaborador 1, 2 e 3 (cria o terceiro, copiando o último profissional, se faltar).
export function comColaboradores(estadoOriginal) {
  const e = clonar(estadoOriginal);
  const profs = e.usuarios.filter((u) => u.papel === 'profissional');
  while (profs.length < 3 && profs.length) {
    const base = profs[profs.length - 1], n = profs.length + 1;
    const novo = { ...clonar(base), id: `u-colaborador${n}`, cpf: `000.000.00${n}-00`, email: `colaborador${n}@exemplo.com.br`, telefone: `(55) 99000-000${n}` };
    e.usuarios.push(novo); profs.push(novo);
  }
  const nomes = {};
  e.usuarios.forEach((u) => { if (u.papel === 'dono') nomes[u.id] = NOME_DONO; });
  profs.forEach((u, i) => { nomes[u.id] = `Colaborador ${i + 1}`; });
  renomear(e, nomes);
  return e;
}

// Só o proprietário (Alan): os demais profissionais saem e o que era deles passa para ele; um horário que bater com o dele (menos de 40 min) é descartado.
export function somenteDono(estadoOriginal, nome = 'Alan') {
  const e = clonar(estadoOriginal);
  const dono = e.usuarios.find((u) => u.papel === 'dono');
  const saem = new Set(e.usuarios.filter((u) => u.id !== dono.id).map((u) => u.id));
  e.usuarios = [dono];
  renomear(e, { [dono.id]: nome });
  const vivo = (a) => a.status !== 'cancelado';
  const ficam = [];
  for (const a of e.agendamentos) {
    if (saem.has(a.profissionalId)) {
      const bate = vivo(a) && e.agendamentos.some((o) => o !== a && vivo(o) && (o.profissionalId === dono.id) && Math.abs(o.inicio - a.inicio) < 40 * 60000);
      if (bate) continue;
      a.profissionalId = dono.id;
    }
    ficam.push(a);
  }
  e.agendamentos = ficam;
  return e;
}

export const PESSOAS_POR_LOJA = Object.freeze({ apex: comColaboradores, offbox: comColaboradores, dalforno: somenteDono });
