/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atender do site real (F2 parte 5c): um botão só para atendimento já feito (agora ou passado, concluído na hora) e agendamento futuro.
// A regra toda (cliente por telefone, conflito, expediente, dia anterior com motivo, quem pode lançar) está no servidor (POST /api/atendimentos);
// a tela mostra as mensagens dele. Produtos (5d-4a): venda com serviço ou só de produto (só no atendimento de agora), com vendedor; forma de pagamento (5d-4c) é a escolhida ou o padrão da loja e os campos obrigatórios vêm das regras da loja. Não importa `api.js`, `hooks.js` nem `common.jsx`.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agenda as api, boxes as apiBoxes, clientes as apiClientes, produtos as apiProdutos, regras as apiRegras, servicos as apiServicos, vinculos as apiVinculos } from '../../services/api-real.js';
import { fmtMoney, startOfDay } from '../../domain/time.js';
import { validarQuando } from '../../domain/validar-quando.js';
import { formatarTelefone, somenteDigitos } from '../../domain/rules.js';
import { Rot, capAtiva } from '../../domain/tipos.js';
import { COMO_A_PAGINA_DO_CLIENTE, PADRAO_PAINEL, sanearOrdemAtender } from '../../domain/ordem-atender.js';
import { EXEMPLO_PORTE, PORTE_PADRAO, ROTULO_PORTE, portesParaEscolher, rotuloVeiculo } from '../../domain/veiculos.js';
import { REGRAS_DE_FABRICA, FORMAS_PAGAMENTO, boxesAtivos, camposFaltando, ehRetroativo, exige, faltaItem, exigenciasDoVeiculo, faltaVeiculo, porteDoAtendimento, formaEfetiva, filtrarProdutos, filtrarServicos, qtdValida, resumoDosProdutos, resumoDosServicos, servicoNoPorte, tipoDoAtendimento, vendedorPadrao } from '../../domain/atender-form.js';
import { ordenarServicos } from '../../domain/ordem-servicos.js';
import { nomeReal, rotuloDoCliente } from '../../domain/cliente-rotulo.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import ProfissionalPorServico from '../leve/ProfissionalPorServico.jsx';
import BlocosDoAtender from '../leve/BlocosDoAtender.jsx';
import { blocosDeHorarios, duracaoIndefinida, erroDeBlocos, textoDoPreco } from '../../domain/blocos.js';
import { precisaAtribuirPorServico } from '../../domain/vinculo.js';

const aoLocal = (ts) => { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const doLocal = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };
const telNacional = (t) => { const d = somenteDigitos(t); return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d; };
const PASSOS_ATENDER = [
  { id: 'servicos', nome: 'Serviços' },
  { id: 'quando', nome: 'Quando' },
  { id: 'cliente', nome: 'Cliente & Concluir' },
];

export default function Atender({ profissionais, equipe, meuId, ehProprio, aoSalvar, aoFechar }) {
  const agora = Date.now();
  const [personalizar, setPersonalizar] = useState(false);
  const [modoQuando, setModoQuando] = useState('agora');
  const [quando, setQuando] = useState(() => aoLocal(Math.ceil(agora / 3600000) * 3600000));
  const [diaBloco, setDiaBloco] = useState(() => aoLocal(agora).slice(0, 10)); // F: dia mostrado na grade de horários do serviço de duração indefinida
  const [horarios, setHorarios] = useState([]); // início de cada horário de 30 min marcado (ms)
  const [valores, setValores] = useState({}); // valor final lançado por serviço indefinido (texto)
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [profId, setProfId] = useState(() => (profissionais.some((p) => p.id === meuId) ? meuId : (profissionais[0] || {}).id || ''));
  const [servicos, setServicos] = useState(null);
  const [vinculos, setVinculos] = useState(null); // A1: serviço -> quem realiza (null = ainda não chegou; não filtra)
  const [profManual, setProfManual] = useState(false); // a pessoa escolheu o profissional à mão: a lista de serviços passa a ser a dele
  const [buscaSrv, setBuscaSrv] = useState('');
  const [ids, setIds] = useState([]);
  const [produtos, setProdutos] = useState(null);
  const [buscaProd, setBuscaProd] = useState('');
  const [itens, setItens] = useState([]); // produtos escolhidos: [{ materialId, qtd }]
  const [vendedorEscolhido, setVendedorEscolhido] = useState('');
  const vendem = useMemo(() => (equipe || profissionais).filter((p) => p.podeVender !== false), [equipe, profissionais]);
  const [regras, setRegras] = useState(REGRAS_DE_FABRICA); // Estabelecimento > Regras; o servidor confere de novo
  const [formaEscolhida, setFormaEscolhida] = useState('');
  const [status, setStatus] = useState('a_confirmar');
  const [encaixe, setEncaixe] = useState(false);
  const [cupomChave, setCupomChave] = useState('');
  // estética: veículo (do cadastro do cliente ou novo) e box (só no agendamento futuro; vazio = o servidor escolhe um livre)
  const usaVeiculo = capAtiva('usaVeiculo');
  const usaBox = capAtiva('usaRecursoFisico');
  const [veiculoId, setVeiculoId] = useState(''); // '' = outro veículo (digitar)
  const [novoVeic, setNovoVeic] = useState({ placa: '', marca: '', modelo: '', cor: '', porte: '' });
  const [boxes, setBoxes] = useState([]);
  const [boxId, setBoxId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  const [etapaAtiva, setEtapaAtiva] = useState(0);

  // Limpa erros ao navegar entre as etapas do atendimento
  useEffect(() => { setErro(''); }, [etapaAtiva]);
  const ultima = useRef(0);

  useEffect(() => {
    if (!sucesso) return undefined;
    const timer = setTimeout(() => aoSalvar(sucesso.texto, sucesso.agendamento), 1200);
    return () => clearTimeout(timer);
  }, [sucesso]);

  useEffect(() => { let vivo = true; apiServicos.listar({ para: 'atender' }).then((r) => { if (vivo) { if (r.ok) setServicos(r.servicos.filter((s) => s.ativo !== false)); else { setServicos([]); setErro(r.erro); } } }); return () => { vivo = false; }; }, []);
  useEffect(() => { let vivo = true; apiVinculos.porServico().then((r) => { if (vivo && r.ok) setVinculos(r.mapa); }); return () => { vivo = false; }; }, []);
  useEffect(() => { let vivo = true; apiRegras.obter().then((r) => { if (vivo && r.ok) setRegras(r.regras); }); return () => { vivo = false; }; }, []);
  useEffect(() => { if (!usaBox) return undefined; let vivo = true; apiBoxes.listar().then((r) => { if (vivo && r.ok) setBoxes(boxesAtivos(r.boxes)); }); return () => { vivo = false; }; }, [usaBox]);
  useEffect(() => { let vivo = true; apiProdutos.listar().then((r) => { if (vivo) setProdutos(r.ok ? r.produtos : []); }); return () => { vivo = false; }; }, []);
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setAchados([]); return undefined; }
    const n = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await apiClientes.listar(q);
      if (n === ultima.current && r.ok) setAchados(r.clientes.slice(0, 5));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  // F (V60): serviço de duração indefinida marcado → o "Quando" vira a grade de horários (blocos); o início é o do primeiro bloco
  const indefSel = (servicos || []).filter((s) => ids.includes(s.id) && duracaoIndefinida(s));
  const usaBlocos = indefSel.length > 0;
  const blocosCalc = blocosDeHorarios(horarios);
  const inicio = usaBlocos ? (blocosCalc[0] ? blocosCalc[0][0] : null) : personalizar ? doLocal(quando) : null;
  const instante = usaBlocos ? (inicio ?? agora) : personalizar ? inicio : agora;
  const tipo = tipoDoAtendimento(instante, agora);
  const retro = (personalizar || usaBlocos) && ehRetroativo(inicio, agora);
  const bloqueado = retro && ehProprio;
  const realiza = (pid, sid) => vinculos === null || (vinculos[sid] || []).includes(pid);
  const autoAtender = regras.profissionalAutomatico === true && !ehProprio; // B9c: o servidor escolhe quem está mais livre
  // A1: quem atende só vê os próprios serviços; escolhendo o profissional à mão a lista passa a ser a dele; senão aparecem os que alguém da equipe realiza
  const servicosVisiveis = useMemo(() => {
    if (!servicos || vinculos === null) return servicos || [];
    if (ehProprio || (profManual && !autoAtender)) return servicos.filter((s) => realiza(profId, s.id));
    return servicos.filter((s) => profissionais.some((p) => realiza(p.id, s.id)));
  }, [servicos, vinculos, ehProprio, profManual, profId, profissionais, autoAtender]); // eslint-disable-line react-hooks/exhaustive-deps
  // ...e o campo do profissional oferece só quem realiza TODOS os serviços já marcados
  const profOpcoes = useMemo(() => profissionais.filter((p) => ids.every((sid) => realiza(p.id, sid))), [profissionais, ids, vinculos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (profOpcoes.length && !profOpcoes.some((p) => p.id === profId)) setProfId(profOpcoes[0].id); }, [profOpcoes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (vinculos !== null && (ehProprio || (profManual && !autoAtender))) setIds((x) => x.filter((sid) => realiza(profId, sid))); }, [profId, profManual, vinculos]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = useMemo(() => filtrarServicos(ordenarServicos(servicosVisiveis, regras.ordemServicos), buscaSrv), [servicosVisiveis, buscaSrv, regras.ordemServicos]);
  const doCliente = (cliente && cliente.veiculos) || [];
  const veiculoEscolhido = usaVeiculo && veiculoId ? doCliente.find((v) => v.id === veiculoId) || null : null;
  const digitando = usaVeiculo && !veiculoEscolhido;
  const porte = porteDoAtendimento(veiculoEscolhido, digitando ? novoVeic : null);
  const resumo = resumoDosServicos(servicos || [], ids, usaVeiculo ? porte : undefined, valores);
  const fixosMin = (servicos || []).filter((s) => ids.includes(s.id) && !duracaoIndefinida(s)).reduce((t, s) => t + servicoNoPorte(s, usaVeiculo ? porte : undefined).duracaoMin, 0);
  const listaProd = useMemo(() => filtrarProdutos(produtos || [], buscaProd), [produtos, buscaProd]);
  const resumoProd = resumoDosProdutos(produtos || [], itens);
  const vendedor = vendem.some((p) => p.id === vendedorEscolhido) ? vendedorEscolhido : vendedorPadrao(vendem, meuId, profId);
  const falta = faltaItem(tipo, ids, itens) || faltaVeiculo(usaVeiculo, ids, veiculoEscolhido, digitando ? novoVeic : null, exigenciasDoVeiculo(regras, tipo));
  const forma = formaEfetiva(regras, formaEscolhida);
  const faltam = camposFaltando(tipo, { nome, telefone, cliente, profissionalId: profId, vendedorId: itens.length ? vendedor : '', temProdutos: itens.length > 0, forma }, regras);
  const auto = autoAtender; // B9c: o campo some e o servidor escolhe quem está mais livre
  // B1: serviços feitos por pessoas diferentes → um campo de profissional por serviço (vazio e obrigatório); o campo único some. Só a recepção e o proprietário escolhem.
  const [atrib, setAtrib] = useState({});
  const porAtribuir = !usaBlocos && !auto && !ehProprio && vinculos !== null && precisaAtribuirPorServico(ids, vinculos);
  useEffect(() => { setAtrib((a) => Object.fromEntries(Object.entries(a).filter(([sid, pid]) => ids.includes(sid) && realiza(pid, sid)))); }, [ids, vinculos]); // eslint-disable-line react-hooks/exhaustive-deps
  const atribuicoes = porAtribuir ? ids.map((sid) => ({ servicoId: sid, profissionalId: atrib[sid] || '' })) : null;
  const faltaAtribuir = porAtribuir && atribuicoes.some((x) => !x.profissionalId) ? 'Escolha o profissional de cada serviço.' : '';
  const marca = (campo) => (exige(regras, tipo, campo) ? ' *' : ' (opcional)');

  const escolher = (c) => { setCliente(c); setVeiculoId(c.veiculos && c.veiculos.length === 1 ? c.veiculos[0].id : ''); setNome(c.apelido || nomeReal(c)); setTelefone(c.telefone ? formatarTelefone(telNacional(c.telefone)) : ''); setBusca(''); setAchados([]); setErro(''); };
  const marcar = (id) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const marcarProd = (id) => setItens((x) => (x.some((i) => i.materialId === id) ? x.filter((i) => i.materialId !== id) : [...x, { materialId: id, qtd: 1 }]));
  const trocarQtd = (id, v) => setItens((x) => x.map((i) => (i.materialId === id ? { ...i, qtd: qtdValida(v) } : i)));
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (usaBlocos) {
      const pseudo = (servicos || []).filter((s) => ids.includes(s.id)).map((s) => ({ nome: s.nome, duracaoMin: duracaoIndefinida(s) ? null : servicoNoPorte(s, usaVeiculo ? porte : undefined).duracaoMin }));
      const problema = erroDeBlocos(pseudo, blocosCalc.length ? blocosCalc : null); if (problema) { setErro(problema); return; }
      const problemaData = validarQuando(inicio, 'data', Date.now()); if (problemaData) { setErro(problemaData); return; }
    } else if (personalizar) { const problema = validarQuando(inicio, modoQuando, Date.now()); if (problema) { setErro(problema); return; } }
    const lancados = [];
    if (usaBlocos) for (const s of indefSel) { const t = String(valores[s.id] ?? '').trim().replace(',', '.'); if (!t) continue; const n = Number(t); if (!Number.isFinite(n) || n < 0) { setErro('Informe um valor válido para o serviço.'); return; } lancados.push({ servicoId: s.id, valor: n }); }
    if (falta) { setErro(falta); return; }
    if (faltaAtribuir) { setErro(faltaAtribuir); return; }
    if (tipo === 'local' && !forma) { setErro('Escolha a forma de pagamento.'); return; }
    setEnviando(true); setErro('');
    const r = await api.atender({
      servicoIds: ids, ...(itens.length ? { produtos: itens, vendedorId: vendedor } : {}), nome, telefone, ...(cliente ? { clienteId: cliente.id } : {}), ...(auto ? {} : { profissionalId: porAtribuir ? atribuicoes[0].profissionalId : profId }), ...(porAtribuir ? { atribuicoes } : {}),
      ...(usaVeiculo && ids.length ? (veiculoEscolhido ? { veiculoId: veiculoEscolhido.id } : { veiculo: novoVeic }) : {}),
      ...(usaBox && tipo === 'futuro' && boxId ? { boxId } : {}),
      ...(usaBlocos ? { blocos: blocosCalc.map(([i, f]) => ({ inicio: i, fim: f })), ...(lancados.length ? { valores: lancados } : {}) } : personalizar ? { inicio } : {}), ...(retro ? { motivoRetroativo: motivo } : {}),
      ...(tipo === 'futuro' ? { status, encaixe, ...(cupomChave.trim() ? { cupomChave } : {}) } : { formaPagamento: forma }),
    });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setSucesso({ texto: tipo === 'futuro' ? 'Agendamento criado.' : 'Atendimento registrado.', agendamento: r.agendamento });
  };

  const padraoOrdem = usaVeiculo ? COMO_A_PAGINA_DO_CLIENTE : PADRAO_PAINEL;
  const ordem = sanearOrdemAtender(regras.ordemAtender, padraoOrdem)[tipo]; // v133: ordem das etapas e dos campos escolhida pelo proprietário (Estabelecimento > Regras)
  const camposVeic = {
    placa: <Campo rotulo={`Placa${marca('placa')}`}><input value={novoVeic.placa} onChange={(e) => { setNovoVeic({ ...novoVeic, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) }); setErro(''); }} maxLength={8} autoComplete="off" placeholder="ABC1D23" data-testid="atender-v-placa" /></Campo>,
    modelo: <Campo rotulo={`Modelo${marca('modelo')}`}><input value={novoVeic.modelo} onChange={(e) => setNovoVeic({ ...novoVeic, modelo: e.target.value })} maxLength={40} autoComplete="off" data-testid="atender-v-modelo" /></Campo>,
    marca: <Campo rotulo="Marca (opcional)"><input value={novoVeic.marca} onChange={(e) => setNovoVeic({ ...novoVeic, marca: e.target.value })} maxLength={30} autoComplete="off" data-testid="atender-v-marca" /></Campo>,
    cor: <Campo rotulo="Cor (opcional)"><input value={novoVeic.cor} onChange={(e) => setNovoVeic({ ...novoVeic, cor: e.target.value })} maxLength={20} autoComplete="off" data-testid="atender-v-cor" /></Campo>,
    porte: (
      <Campo rotulo={`Porte do veículo${marca('porte')}`} className="campo-largo">
        <div className="pub-portes" role="group" aria-label="Porte do veículo">
          {portesParaEscolher(novoVeic.porte).map(({ id: k, nome, exemplo }) => {
            const rot = ROTULO_PORTE[k] || nome;
            const ex = (EXEMPLO_PORTE[k] || exemplo || '').replace('Ex.: ', '');
            const ativo = (novoVeic.porte || PORTE_PADRAO) === k;
            return (
              <button
                type="button"
                key={k}
                className={`pub-porte ${ativo ? 'on' : ''}`}
                aria-pressed={ativo}
                onClick={() => { setNovoVeic({ ...novoVeic, porte: k }); setErro(''); }}
                data-testid={`atender-v-porte-${k}`}
              >
                <b>{rot}</b>
                {ex && <small>{ex}</small>}
              </button>
            );
          })}
        </div>
        <select
          value={novoVeic.porte || PORTE_PADRAO}
          onChange={(e) => { setNovoVeic({ ...novoVeic, porte: e.target.value }); setErro(''); }}
          data-testid="atender-v-porte"
          aria-label="Porte do veículo"
          style={{ position: 'absolute', opacity: 0.01, width: 20, height: 20, zIndex: -1 }}
        >
          <option value="">{exige(regras, tipo, 'porte') ? 'Escolha…' : `${ROTULO_PORTE[PORTE_PADRAO]} (padrão)`}</option>
          {portesParaEscolher(novoVeic.porte).map(({ id: k }) => <option key={k} value={k}>{ROTULO_PORTE[k]}</option>)}
        </select>
      </Campo>
    ),
  };
  const camposCli = {
    nome: <Campo rotulo={`Apelido${marca('nome')}`}>
      <input value={nome} onChange={(e) => { setNome(e.target.value); if (!cliente) setBusca(e.target.value); }} maxLength={60} placeholder="Apelido do cliente" autoComplete="off" data-testid="atender-nome" />
      {!cliente && achados.length > 0 && (
        <ul className="atender-real-achados" data-testid="atender-achados">
          {achados.map((c) => <li key={c.id}><button type="button" className="atender-real-achado" onClick={() => escolher(c)} data-testid={`atender-cli-${c.id}`}>{rotuloDoCliente(c)}<span className="muted"> · {c.telefone ? formatarTelefone(telNacional(c.telefone)) : ''}</span></button></li>)}
        </ul>
      )}
    </Campo>,
    telefone: <Campo rotulo={`Telefone${marca('telefone')}`}><input value={telefone} inputMode="tel" autoComplete="off" onChange={(e) => setTelefone(e.target.value)} placeholder="(55) 99999-9999" data-testid="atender-telefone" /></Campo>,
  };
  const blocos = {
    veiculo: usaVeiculo ? (
        <fieldset className="atender-real-bloco" id="atender-bloco-veiculo" data-testid="atender-veiculo-bloco">
          <legend>Veículo{exigenciasDoVeiculo(regras, tipo).length ? ' *' : ''}</legend>
          {doCliente.length > 0 && (
            <div className="acoes" role="group" aria-label="Veículos do cliente">
              {doCliente.map((v) => (
                <label key={v.id} className={`radio-op ${veiculoId === v.id ? 'on' : ''}`}><input type="radio" name="atender-veiculo" checked={veiculoId === v.id} onChange={() => { setVeiculoId(v.id); setErro(''); }} data-testid={`atender-veiculo-${v.id}`} />{rotuloVeiculo(v)}</label>
              ))}
              <label className={`radio-op ${!veiculoId ? 'on' : ''}`}><input type="radio" name="atender-veiculo" checked={!veiculoId} onChange={() => { setVeiculoId(''); setErro(''); }} data-testid="atender-veiculo-outro" />Outro veículo</label>
            </div>
          )}
          {digitando && (
            <div className="form-grade" data-testid="atender-veiculo-novo">
              {ordem.veiculo.map((k) => <React.Fragment key={k}>{camposVeic[k]}</React.Fragment>)}
            </div>
          )}
          <p className="muted">{veiculoEscolhido ? `Porte ${ROTULO_PORTE[veiculoEscolhido.porte] || ROTULO_PORTE[porte]}: define o preço e o tempo dos serviços.` : 'O veículo novo fica salvo no cadastro do cliente (quando há telefone). O porte define o preço e o tempo dos serviços.'}</p>
        </fieldset>
    ) : null,
    servicos: (
      <fieldset className="atender-real-bloco" id="atender-bloco-servicos">
        <legend>Serviços</legend>
        <Campo rotulo="Buscar serviço"><input value={buscaSrv} onChange={(e) => setBuscaSrv(e.target.value)} maxLength={40} placeholder="Nome ou código" data-testid="atender-busca-servico" /></Campo>
        {servicos === null && <p className="muted" role="status">Carregando…</p>}
        {servicos !== null && lista.length === 0 && <p className="muted" data-testid="atender-sem-servicos">{servicos.length ? 'Nenhum serviço com essa busca.' : 'Nenhum serviço cadastrado.'}</p>}
        <ul className="atender-real-servicos" data-testid="atender-lista-servicos">
          {lista.map((s) => (
            <li key={s.id}>
              <label className="check-linha"><input type="checkbox" checked={ids.includes(s.id)} onChange={() => marcar(s.id)} data-testid={`atender-srv-${s.id}`} /><span className="atender-real-item"><b>{s.nome}</b><small className="muted">{duracaoIndefinida(s) ? `${s.duracaoTexto || 'Duração indefinida'} · ${textoDoPreco(s, fmtMoney)}` : usaVeiculo ? `${servicoNoPorte(s, porte).duracaoMin} min · ${fmtMoney(servicoNoPorte(s, porte).preco)}` : `${s.duracaoMin} min · ${fmtMoney(s.preco)}`}</small></span></label>
            </li>
          ))}
        </ul>
        <p className="muted" data-testid="atender-total">{resumo.qtd ? `${resumo.qtd} serviço${resumo.qtd === 1 ? '' : 's'} · ${resumo.minutos} min · ${fmtMoney(resumo.total)}` : itens.length ? 'Só produtos: registra a venda de agora.' : 'Escolha ao menos um serviço ou um produto.'}</p>
      </fieldset>
    ),
    quando: (
      <fieldset className="atender-real-bloco" id="atender-bloco-quando" data-testid="atender-quando-bloco">
        <legend>{usaBlocos ? 'Dia e horário' : 'Quando'}</legend>
        {usaBlocos && <BlocosDoAtender dia={diaBloco} aoMudarDia={(d) => { setDiaBloco(d); setErro(''); }} horarios={horarios} aoMudar={(h) => { setHorarios(h); setErro(''); }} fixosMin={fixosMin} indefinidos={indefSel} valores={valores} aoMudarValores={setValores} />}
        {!usaBlocos && <div className="acoes">
          <button type="button" className={`btn btn-quando${modoQuando === 'atendido' ? ' btn-on' : ''}`} aria-pressed={modoQuando === 'atendido'} onClick={() => { setModoQuando('atendido'); setPersonalizar(true); setQuando(aoLocal(Math.floor((Date.now() - 60000) / 300000) * 300000)); setErro(''); }} data-testid="atender-atendido">Atendido</button>
          <button type="button" className={`btn btn-quando${!personalizar ? ' btn-on' : ''}`} aria-pressed={!personalizar} onClick={() => { setModoQuando('agora'); setPersonalizar(false); setErro(''); }} data-testid="atender-agora"><Icone n="clock" size={15} />Agora</button>
          <button type="button" className={`btn btn-quando${modoQuando === 'data' ? ' btn-on' : ''}`} aria-pressed={modoQuando === 'data'} onClick={() => { setModoQuando('data'); setPersonalizar(true); setErro(''); }} data-testid="atender-quando"><Icone n="calendar" size={15} />Escolher data</button>
        </div>}
        {personalizar && !usaBlocos && <Campo rotulo="Data e hora"><input type="datetime-local" step={300} max={modoQuando === 'atendido' ? aoLocal(Date.now()) : undefined} value={quando} onChange={(e) => { setQuando(e.target.value); setErro(''); }} data-testid="atender-data" /></Campo>}
        {retro && !bloqueado && (
          <Campo rotulo="Motivo do lançamento de um dia anterior">
            <input type="text" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que não foi registrado na hora? (fica no histórico)" data-testid="atender-motivo-retro" />
          </Campo>
        )}
        {bloqueado && <Aviso tipo="erro" data-testid="atender-retro-bloqueado">Lançar um dia anterior é com o proprietário ou a recepção. Peça a eles para registrar.</Aviso>}
        <p className="muted" data-testid="atender-tipo">{tipo === 'futuro' ? 'Agendamento: o horário fica reservado para o cliente.' : 'Atendimento já feito: entra como concluído.'}</p>
      </fieldset>
    ),
    cliente: (
      <fieldset className="atender-real-bloco" id="atender-bloco-cliente">
        <legend>Cliente</legend>
        {cliente ? (
          <p className="msg-ok" data-testid="atender-vinculo">Cadastro escolhido: {rotuloDoCliente(cliente)}. <button type="button" className="link" onClick={() => { setCliente(null); setVeiculoId(''); }} data-testid="atender-trocar-cliente">Trocar</button></p>
        ) : null}
        <div className="form-grade">
          {ordem.cliente.map((k) => <React.Fragment key={k}>{camposCli[k]}</React.Fragment>)}
        </div>
        <p className="muted">Com telefone, o cadastro é achado ou criado. Só com o apelido, nada é cadastrado.</p>
      </fieldset>
    ),
    produtos: produtos !== null && produtos.length > 0 ? (
        <fieldset className="atender-real-bloco" data-testid="atender-produtos-bloco">
          <legend>Produtos (opcional)</legend>
          <Campo rotulo="Buscar produto"><input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} maxLength={40} placeholder="Nome ou código" data-testid="atender-busca-produto" /></Campo>
          {listaProd.length === 0 && <p className="muted">Nenhum produto com essa busca.</p>}
          <ul className="atender-real-servicos" data-testid="atender-lista-produtos">
            {listaProd.map((p) => {
              const it = itens.find((i) => i.materialId === p.id);
              return (
                <li key={p.id}>
                  <label className="check-linha"><input type="checkbox" checked={!!it} onChange={() => marcarProd(p.id)} data-testid={`atender-prod-${p.id}`} /><span className="atender-real-item"><b>{p.nome}</b><small className="muted">{fmtMoney(p.preco)} · estoque {p.estoque}</small></span></label>
                  {it && <input type="number" min={1} max={999} step={1} value={it.qtd} onChange={(e) => trocarQtd(p.id, e.target.value)} aria-label={`Quantidade de ${p.nome}`} data-testid={`atender-qtd-${p.id}`} />}
                </li>
              );
            })}
          </ul>
          {itens.length > 0 && (
            <>
              <Campo rotulo={`Quem vendeu${marca('vendedor')}`}>
                <select value={vendedor} onChange={(e) => setVendedorEscolhido(e.target.value)} disabled={ehProprio} data-testid="atender-vendedor">
                  {vendem.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Campo>
              <p className="muted" data-testid="atender-total-produtos">{resumoProd.qtd} unidade{resumoProd.qtd === 1 ? '' : 's'} · {fmtMoney(resumoProd.total)} em produtos</p>
            </>
          )}
        </fieldset>
    ) : null,
  };

  if (sucesso) return <div className="atender-real atender-sucesso-real" role="status" aria-live="polite" data-testid="atender-sucesso"><span className="atender-sucesso-icone-real"><Icone n="check" size={32} /></span><strong>{sucesso.texto}</strong></div>;

  return (
    <form className="atender-real" onSubmit={enviar} data-testid="atender-form" aria-label="Atender">
      <div className="atender-real-topo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="atender-real-titulo">Atender</h3>
          <span className="badge-modo" style={{ background: 'var(--surface-3)', border: '1px solid var(--line-strong)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>
            {tipo === 'futuro' ? '📅 Agendamento' : '⚡ Agora'}
          </span>
        </div>
        <Btn tamanho="sm" onClick={aoFechar} data-testid="atender-fechar" aria-label="Fechar"><Icone n="x" size={15} /></Btn>
      </div>

      <ol className="pub-passos atender-passos-real">
        {PASSOS_ATENDER.map((p, idx) => (
          <li key={p.id} className={etapaAtiva === idx ? 'on' : ''}>
            <button type="button" className="atender-passo-real" aria-current={etapaAtiva === idx ? 'step' : undefined} onClick={() => setEtapaAtiva(idx)}><span>{idx + 1}</span> {p.nome}</button>
          </li>
        ))}
      </ol>

      {ordem.etapas.filter((k) => k !== 'veiculo').map((k) => <div className="atender-pagina-real" key={k} hidden={(k === 'produtos' ? 'servicos' : k) !== PASSOS_ATENDER[etapaAtiva].id}>{blocos[k]}</div>)}
      {usaVeiculo && <div className="atender-pagina-real" hidden={PASSOS_ATENDER[etapaAtiva].id !== 'cliente'}>{blocos.veiculo}</div>}

      <div className="atender-conclusao-real" hidden={PASSOS_ATENDER[etapaAtiva].id !== 'cliente'}>
      <div className="form-grade">
        {porAtribuir && (
          <ProfissionalPorServico testid="atender-pps" servicos={ids.map((sid) => ({ id: sid, nome: (servicos || []).find((s) => s.id === sid)?.nome || '' }))} rotuloProfissional={Rot('profissional')}
            opcoes={(sid) => profissionais.filter((p) => realiza(p.id, sid)).map((p) => ({ id: p.id, nome: p.nome }))} valor={atrib} aoMudar={setAtrib} />
        )}
        {!auto && !porAtribuir && (
          <Campo rotulo={`${Rot('profissional')}${exige(regras, tipo, 'profissional') ? ' *' : ''}`}>
            <select value={profId} onChange={(e) => { setProfId(e.target.value); setProfManual(true); }} disabled={ehProprio} data-testid="atender-profissional">
              {profOpcoes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        )}
        {tipo === 'futuro' && (
          <div className="campo">
            <span className="campo-rotulo">Situação</span>
            <div className="acoes">
              {[['a_confirmar', 'A confirmar'], ['confirmado', 'Confirmado']].map(([k, r]) => (
                <label key={k} className={`radio-op ${status === k ? 'on' : ''}`}><input type="radio" name="atender-status" checked={status === k} onChange={() => setStatus(k)} data-testid={`atender-status-${k}`} />{r}</label>
              ))}
            </div>
          </div>
        )}
      </div>
      {tipo === 'local' && (
        <fieldset className="atender-real-bloco" data-testid="atender-forma-bloco">
          <legend>{`Forma de pagamento${exige(regras, tipo, 'formaPagamento') ? ' *' : ''}`}</legend>
          <div className="acoes">
            {FORMAS_PAGAMENTO.map(([k, r]) => (
              <label key={k} className={`radio-op ${forma === k ? 'on' : ''}`}><input type="radio" name="atender-forma" checked={forma === k} onChange={() => { setFormaEscolhida(k); setErro(''); }} data-testid={`atender-forma-${k}`} />{r}</label>
            ))}
          </div>
          <p className="muted">Só fica registrado (a cobrança e o financeiro vêm depois).</p>
        </fieldset>
      )}
      {usaBox && tipo === 'futuro' && boxes.length > 0 && (
        <Campo rotulo="Box (opcional)">
          <select value={boxId} onChange={(e) => { setBoxId(e.target.value); setErro(''); }} data-testid="atender-box">
            <option value="">Automático (um box livre)</option>
            {boxes.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </Campo>
      )}
      {tipo === 'futuro' && (
        <Campo rotulo="Cupom (chave, opcional)">
          <input value={cupomChave} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => { setCupomChave(e.target.value); setErro(''); }} placeholder="XXXX-XXXX-XXXX" data-testid="atender-cupom" />
        </Campo>
      )}
      {tipo === 'futuro' && <label className="check-linha"><input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} data-testid="atender-encaixe" /><span>Encaixe (pode ficar sobre um horário já confirmado)</span></label>}
      </div>

      {faltam.length > 0 && <p className="muted" data-testid="atender-faltam">Falta preencher: {faltam.join(', ')}.</p>}
      {erro && <Aviso tipo="erro" data-testid="atender-erro">{erro}</Aviso>}
      <div className="acoes atender-acoes-real">
        <Btn onClick={aoFechar} data-testid="atender-cancelar">Cancelar</Btn>
        {etapaAtiva > 0 && <Btn type="button" onClick={() => setEtapaAtiva(etapaAtiva - 1)} data-testid="atender-voltar">← Voltar</Btn>}
        {etapaAtiva === 0 && <Btn variante="primario" type="button" onClick={() => setEtapaAtiva(1)} data-testid="atender-prox-quando">Próximo →</Btn>}
        {etapaAtiva === 1 && <Btn variante="primario" type="button" onClick={() => setEtapaAtiva(2)} data-testid="atender-prox-cliente">Próximo →</Btn>}
        {PASSOS_ATENDER[etapaAtiva].id === 'cliente' && <Btn variante="primario" type="submit" disabled={enviando || bloqueado} data-testid="salvar-atender">{enviando ? 'Salvando…' : tipo === 'futuro' ? 'Agendar' : 'Registrar'}</Btn>}
      </div>
    </form>
  );
}
