/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atender do site real (F2 parte 5c): um botão só para atendimento já feito (agora ou passado, concluído na hora) e agendamento futuro.
// A regra toda (cliente por telefone, conflito, expediente, dia anterior com motivo, quem pode lançar) está no servidor (POST /api/atendimentos);
// a tela mostra as mensagens dele. Produtos (5d-4a): venda com serviço ou só de produto (só no atendimento de agora), com vendedor; forma de pagamento (5d-4c) é a escolhida ou o padrão da loja e os campos obrigatórios vêm das regras da loja. Não importa `api.js`, `hooks.js` nem `common.jsx`.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agenda as api, boxes as apiBoxes, clientes as apiClientes, produtos as apiProdutos, regras as apiRegras, servicos as apiServicos } from '../../services/api-real.js';
import { fmtMoney, startOfDay } from '../../domain/time.js';
import { formatarTelefone, somenteDigitos } from '../../domain/rules.js';
import { Rot, capAtiva } from '../../domain/tipos.js';
import { PORTES, ROTULO_PORTE, rotuloVeiculo } from '../../domain/veiculos.js';
import { REGRAS_DE_FABRICA, FORMAS_PAGAMENTO, boxesAtivos, camposFaltando, ehRetroativo, exige, faltaItem, faltaVeiculo, porteDoAtendimento, formaEfetiva, filtrarProdutos, filtrarServicos, qtdValida, resumoDosProdutos, resumoDosServicos, servicoNoPorte, tipoDoAtendimento, vendedorPadrao } from '../../domain/atender-form.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const aoLocal = (ts) => { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const doLocal = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };
const telNacional = (t) => { const d = somenteDigitos(t); return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d; };

export default function Atender({ profissionais, equipe, meuId, ehProprio, aoSalvar, aoFechar }) {
  const agora = Date.now();
  const [personalizar, setPersonalizar] = useState(false);
  const [quando, setQuando] = useState(() => aoLocal(Math.ceil(agora / 3600000) * 3600000));
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [profId, setProfId] = useState(() => (profissionais.some((p) => p.id === meuId) ? meuId : (profissionais[0] || {}).id || ''));
  const [servicos, setServicos] = useState(null);
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
  const ultima = useRef(0);

  useEffect(() => { let vivo = true; apiServicos.listar().then((r) => { if (vivo) { if (r.ok) setServicos(r.servicos.filter((s) => s.ativo !== false)); else { setServicos([]); setErro(r.erro); } } }); return () => { vivo = false; }; }, []);
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

  const inicio = personalizar ? doLocal(quando) : null;
  const instante = personalizar ? inicio : agora;
  const tipo = tipoDoAtendimento(instante, agora);
  const retro = personalizar && ehRetroativo(inicio, agora);
  const bloqueado = retro && ehProprio;
  const lista = useMemo(() => filtrarServicos(servicos || [], buscaSrv), [servicos, buscaSrv]);
  const doCliente = (cliente && cliente.veiculos) || [];
  const veiculoEscolhido = usaVeiculo && veiculoId ? doCliente.find((v) => v.id === veiculoId) || null : null;
  const digitando = usaVeiculo && !veiculoEscolhido;
  const porte = porteDoAtendimento(veiculoEscolhido, digitando ? novoVeic : null);
  const resumo = resumoDosServicos(servicos || [], ids, usaVeiculo ? porte : undefined);
  const listaProd = useMemo(() => filtrarProdutos(produtos || [], buscaProd), [produtos, buscaProd]);
  const resumoProd = resumoDosProdutos(produtos || [], itens);
  const vendedor = vendem.some((p) => p.id === vendedorEscolhido) ? vendedorEscolhido : vendedorPadrao(vendem, meuId, profId);
  const falta = faltaItem(tipo, ids, itens) || faltaVeiculo(usaVeiculo, ids, veiculoEscolhido, digitando ? novoVeic : null);
  const forma = formaEfetiva(regras, formaEscolhida);
  const faltam = camposFaltando(tipo, { nome, telefone, cliente, profissionalId: profId, vendedorId: itens.length ? vendedor : '', temProdutos: itens.length > 0, forma }, regras);
  const marca = (campo) => (exige(regras, tipo, campo) ? ' *' : '');

  const escolher = (c) => { setCliente(c); setVeiculoId(c.veiculos && c.veiculos.length === 1 ? c.veiculos[0].id : ''); setNome(c.apelido || c.nome); setTelefone(c.telefone ? formatarTelefone(telNacional(c.telefone)) : ''); setBusca(''); setAchados([]); setErro(''); };
  const marcar = (id) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const marcarProd = (id) => setItens((x) => (x.some((i) => i.materialId === id) ? x.filter((i) => i.materialId !== id) : [...x, { materialId: id, qtd: 1 }]));
  const trocarQtd = (id, v) => setItens((x) => x.map((i) => (i.materialId === id ? { ...i, qtd: qtdValida(v) } : i)));
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (personalizar && inicio === null) { setErro('Informe a data e a hora.'); return; }
    if (falta) { setErro(falta); return; }
    if (tipo === 'local' && !forma) { setErro('Escolha a forma de pagamento.'); return; }
    setEnviando(true); setErro('');
    const r = await api.atender({
      servicoIds: ids, ...(itens.length ? { produtos: itens, vendedorId: vendedor } : {}), nome, telefone, ...(cliente ? { clienteId: cliente.id } : {}), profissionalId: profId,
      ...(usaVeiculo && ids.length ? (veiculoEscolhido ? { veiculoId: veiculoEscolhido.id } : { veiculo: novoVeic }) : {}),
      ...(usaBox && tipo === 'futuro' && boxId ? { boxId } : {}),
      ...(personalizar ? { inicio } : {}), ...(retro ? { motivoRetroativo: motivo } : {}),
      ...(tipo === 'futuro' ? { status, encaixe, ...(cupomChave.trim() ? { cupomChave } : {}) } : { formaPagamento: forma }),
    });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(tipo === 'futuro' ? 'Agendamento criado.' : 'Atendimento registrado.', r.agendamento);
  };

  return (
    <form className="atender-real" onSubmit={enviar} data-testid="atender-form" aria-label="Atender">
      <div className="atender-real-topo">
        <h3 className="atender-real-titulo">Atender</h3>
        <Btn tamanho="sm" onClick={aoFechar} data-testid="atender-fechar" aria-label="Fechar"><Icone n="x" size={15} /></Btn>
      </div>

      <fieldset className="atender-real-bloco">
        <legend>Cliente</legend>
        {cliente ? (
          <p className="msg-ok" data-testid="atender-vinculo">Cadastro escolhido: {cliente.apelido || cliente.nome}. <button type="button" className="link" onClick={() => { setCliente(null); setVeiculoId(''); }} data-testid="atender-trocar-cliente">Trocar</button></p>
        ) : (
          <Campo rotulo="Buscar cliente cadastrado (opcional)"><input value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={60} placeholder="Nome ou telefone" autoComplete="off" data-testid="atender-busca" /></Campo>
        )}
        {achados.length > 0 && (
          <ul className="atender-real-achados" data-testid="atender-achados">
            {achados.map((c) => <li key={c.id}><button type="button" className="atender-real-achado" onClick={() => escolher(c)} data-testid={`atender-cli-${c.id}`}>{c.apelido || c.nome}<span className="muted"> · {c.telefone ? formatarTelefone(telNacional(c.telefone)) : ''}</span></button></li>)}
          </ul>
        )}
        <div className="form-grade">
          <Campo rotulo={`Nome${marca('nome')}`}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Nome ou apelido" data-testid="atender-nome" /></Campo>
          <Campo rotulo={`Telefone${marca('telefone')}`}><input value={telefone} inputMode="tel" autoComplete="off" onChange={(e) => setTelefone(e.target.value)} placeholder="(55) 99999-9999" data-testid="atender-telefone" /></Campo>
        </div>
        <p className="muted">Com telefone, o cadastro é achado ou criado. Só com o nome, nada é cadastrado.</p>
      </fieldset>

      {usaVeiculo && (
        <fieldset className="atender-real-bloco" data-testid="atender-veiculo-bloco">
          <legend>Veículo</legend>
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
              <Campo rotulo="Placa *"><input value={novoVeic.placa} onChange={(e) => { setNovoVeic({ ...novoVeic, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) }); setErro(''); }} maxLength={8} autoComplete="off" placeholder="ABC1D23" data-testid="atender-v-placa" /></Campo>
              <Campo rotulo="Modelo *"><input value={novoVeic.modelo} onChange={(e) => setNovoVeic({ ...novoVeic, modelo: e.target.value })} maxLength={40} autoComplete="off" data-testid="atender-v-modelo" /></Campo>
              <Campo rotulo="Marca"><input value={novoVeic.marca} onChange={(e) => setNovoVeic({ ...novoVeic, marca: e.target.value })} maxLength={30} autoComplete="off" data-testid="atender-v-marca" /></Campo>
              <Campo rotulo="Cor"><input value={novoVeic.cor} onChange={(e) => setNovoVeic({ ...novoVeic, cor: e.target.value })} maxLength={20} autoComplete="off" data-testid="atender-v-cor" /></Campo>
              <Campo rotulo="Porte *"><select value={novoVeic.porte} onChange={(e) => { setNovoVeic({ ...novoVeic, porte: e.target.value }); setErro(''); }} data-testid="atender-v-porte"><option value="">Escolha…</option>{PORTES.map((k) => <option key={k} value={k}>{ROTULO_PORTE[k]}</option>)}</select></Campo>
            </div>
          )}
          <p className="muted">{veiculoEscolhido ? `Porte ${ROTULO_PORTE[veiculoEscolhido.porte] || ROTULO_PORTE[porte]}: define o preço e o tempo dos serviços.` : 'O veículo novo fica salvo no cadastro do cliente (quando há telefone). O porte define o preço e o tempo dos serviços.'}</p>
        </fieldset>
      )}

      <fieldset className="atender-real-bloco">
        <legend>Serviços</legend>
        <Campo rotulo="Buscar serviço"><input value={buscaSrv} onChange={(e) => setBuscaSrv(e.target.value)} maxLength={40} placeholder="Nome ou código" data-testid="atender-busca-servico" /></Campo>
        {servicos === null && <p className="muted" role="status">Carregando…</p>}
        {servicos !== null && lista.length === 0 && <p className="muted" data-testid="atender-sem-servicos">{servicos.length ? 'Nenhum serviço com essa busca.' : 'Nenhum serviço cadastrado.'}</p>}
        <ul className="atender-real-servicos" data-testid="atender-lista-servicos">
          {lista.map((s) => (
            <li key={s.id}>
              <label className="check-linha"><input type="checkbox" checked={ids.includes(s.id)} onChange={() => marcar(s.id)} data-testid={`atender-srv-${s.id}`} /><span className="atender-real-item"><b>{s.nome}</b><small className="muted">{usaVeiculo ? `${servicoNoPorte(s, porte).duracaoMin} min · ${fmtMoney(servicoNoPorte(s, porte).preco)}` : `${s.duracaoMin} min · ${fmtMoney(s.preco)}`}</small></span></label>
            </li>
          ))}
        </ul>
        <p className="muted" data-testid="atender-total">{resumo.qtd ? `${resumo.qtd} serviço${resumo.qtd === 1 ? '' : 's'} · ${resumo.minutos} min · ${fmtMoney(resumo.total)}` : itens.length ? 'Só produtos: registra a venda de agora.' : 'Escolha ao menos um serviço ou um produto.'}</p>
      </fieldset>

      <fieldset className="atender-real-bloco" data-testid="atender-quando-bloco">
        <legend>Quando</legend>
        <div className="acoes">
          <button type="button" className={`btn btn-quando${!personalizar ? ' btn-on' : ''}`} aria-pressed={!personalizar} onClick={() => { setPersonalizar(false); setErro(''); }} data-testid="atender-agora"><Icone n="clock" size={15} />Agora</button>
          <button type="button" className={`btn btn-quando${personalizar ? ' btn-on' : ''}`} aria-pressed={personalizar} onClick={() => { setPersonalizar(true); setErro(''); }} data-testid="atender-quando"><Icone n="calendar" size={15} />Escolher data e hora</button>
        </div>
        {personalizar && <Campo rotulo="Data e hora"><input type="datetime-local" step={300} value={quando} onChange={(e) => { setQuando(e.target.value); setErro(''); }} data-testid="atender-data" /></Campo>}
        {retro && !bloqueado && (
          <Campo rotulo="Motivo do lançamento de um dia anterior">
            <input type="text" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que não foi registrado na hora? (fica no histórico)" data-testid="atender-motivo-retro" />
          </Campo>
        )}
        {bloqueado && <Aviso tipo="erro" data-testid="atender-retro-bloqueado">Lançar um dia anterior é com o proprietário ou a recepção. Peça a eles para registrar.</Aviso>}
        <p className="muted" data-testid="atender-tipo">{tipo === 'futuro' ? 'Agendamento: o horário fica reservado para o cliente.' : 'Atendimento já feito: entra como concluído.'}</p>
      </fieldset>

      {produtos !== null && produtos.length > 0 && (
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
      )}

      <div className="form-grade">
        <Campo rotulo={`${Rot('profissional')}${marca('profissional')}`}>
          <select value={profId} onChange={(e) => setProfId(e.target.value)} disabled={ehProprio} data-testid="atender-profissional">
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
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
          <legend>{`Forma de pagamento${marca('formaPagamento')}`}</legend>
          <div className="acoes">
            {FORMAS_PAGAMENTO.map(([k, r]) => (
              <label key={k} className={`radio-op ${forma === k ? 'on' : ''}`}><input type="radio" name="atender-forma" checked={forma === k} onChange={() => { setFormaEscolhida(k); setErro(''); }} data-testid={`atender-forma-${k}`} />{r}</label>
            ))}
          </div>
          <p className="muted">Só fica registrado (a cobrança e o financeiro vêm depois).</p>
        </fieldset>
      )}
      {usaBox && tipo === 'futuro' && boxes.length > 0 && (
        <Campo rotulo="Box">
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

      {faltam.length > 0 && <p className="muted" data-testid="atender-faltam">Falta preencher: {faltam.join(', ')}.</p>}
      {erro && <Aviso tipo="erro" data-testid="atender-erro">{erro}</Aviso>}
      <div className="acoes">
        <Btn onClick={aoFechar} data-testid="atender-cancelar">Cancelar</Btn>
        <Btn variante="primario" type="submit" disabled={enviando || bloqueado} data-testid="salvar-atender">{enviando ? 'Salvando…' : tipo === 'futuro' ? 'Agendar' : 'Registrar'}</Btn>
      </div>
    </form>
  );
}
