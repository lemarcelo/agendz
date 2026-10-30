/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:2bd105c6cd */
import ListaItens from './ListaItens.jsx';
import { casaBusca, porUltimoUso } from '../domain/codigo.js';
import { servicosNaOrdemDaLoja } from '../domain/ordem-servicos.js';
import React, { useEffect, useMemo, useState } from 'react';
import { agenda, clientes as apiClientes, comissoes, destinosCalendario } from '../services/api.js';
import { ROTULO_STATUS, STATUS, boxesAtivos, duracaoMin, exigeConfirmacaoServico, nomeBox, ocupadoMin, ocupacaoDe, servicosPorIds, totalPreco, notificacoesEfetivas } from '../domain/rules.js';
import { ROTULO_PORTE, rotuloVeiculo } from '../domain/veiculos.js';
import { visualDoCartao } from '../domain/marcadores.js';
import { valoresPadraoModelo, MODELOS_SO_AUTOMATICOS } from '../domain/engine.js';
import { renderizar, variaveisDoCorpo } from '../domain/templates.js';
import { itensDoAgendamento, produtosDoAgendamento, somaItens, totalAcrescimos, totalProdutos } from '../domain/reports.js';
import { fmtDayLong } from '../domain/time.js';
import { MIN, fmtDate, fmtDateTime, fmtDuration, fmtHM, fmtMoney, fmtRelative, fromYmd, pad, startOfDay, tsAt, ymd } from '../domain/time.js';
import { Aviso, rolarAoErro, Btn, Campo, Etiquetas, Icon, Modal, StatusChip } from './common.jsx';
import { profissionalDe, campoLog, clienteDe, nomeProfissional, nomeCliente, nomeServicos, textoSemConfirmacao, textoUltimo } from './format.js';
import { Pagamento } from './Pagamento.jsx';
import { comissaoJaPaga, ehDono, formatarTelefone, usaIntegracaoPix } from '../domain/rules.js';
import { agendamentosVisiveis } from '../services/api.js';
import { partesDoAgendamento } from '../domain/comissao.js';
import { toast, useStore } from './hooks.js';
import { abrirWhatsapp } from './whatsapp.js';
import { numeroWhatsapp, textoReagendamento } from '../domain/whatsapp.js';
import { mapaDaLoja } from '../domain/publico.js';
import { capAtiva, rot, Rot, Voc } from '../domain/tipos.js';

// Seletor de hora no estilo despertador: setas e roda do mouse em horas e minutos.
export function SeletorHora({ valor, onChange, passo = 10 }) {
  const h = Math.floor(valor / 60);
  const m = valor % 60;
  const set = (nh, nm) => onChange(((nh * 60 + nm) % 1440 + 1440) % 1440);
  const ajustaH = (d) => set(h + d, m);
  const ajustaM = (d) => { const t = valor + d * passo; set(Math.floor(t / 60), ((t % 60) + 60) % 60); };
  const roda = (fn) => (e) => { e.preventDefault(); fn(e.deltaY < 0 ? 1 : -1); };
  const tecla = (fn) => (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); fn(1); } if (e.key === 'ArrowDown') { e.preventDefault(); fn(-1); } };
  const digita = (parte) => (e) => {
    const n = Number(e.target.value.replace(/\D/g, '').slice(-2));
    if (Number.isNaN(n)) return;
    if (parte === 'h') set(Math.min(23, n), m); else set(h, Math.min(59, n));
  };
  return (
    <div className="seletor-hora" role="group" aria-label="Hora do agendamento">
      <div className="sh-col" onWheel={roda(ajustaH)}>
        <button type="button" className="sh-seta" onClick={() => ajustaH(1)} aria-label="Hora mais"><Icon n="up" /></button>
        <input className="sh-num" inputMode="numeric" value={pad(h)} onChange={digita('h')} onKeyDown={tecla(ajustaH)} aria-label="Hora" data-testid="hora-h" />
        <button type="button" className="sh-seta" onClick={() => ajustaH(-1)} aria-label="Hora menos"><Icon n="down" /></button>
      </div>
      <span className="sh-dois">:</span>
      <div className="sh-col" onWheel={roda(ajustaM)}>
        <button type="button" className="sh-seta" onClick={() => ajustaM(1)} aria-label="Minutos mais"><Icon n="up" /></button>
        <input className="sh-num" inputMode="numeric" value={pad(m)} onChange={digita('m')} onKeyDown={tecla(ajustaM)} aria-label="Minutos" data-testid="hora-m" />
        <button type="button" className="sh-seta" onClick={() => ajustaM(-1)} aria-label="Minutos menos"><Icon n="down" /></button>
      </div>
    </div>
  );
}

export function FormAgendamento({ user, inicial = {}, remarcarId, onClose, onSalvo }) {
  const { state: st, agora } = useStore();
  const alvo = remarcarId ? st.agendamentos.find((a) => a.id === remarcarId) : null;
  const profissionais = st.usuarios.filter((u) => u.atende && (user.papel !== 'profissional' || u.id === user.id));
  const [clienteId, setClienteId] = useState(alvo?.clienteId || '');
  const [novo, setNovo] = useState(false);
  const [nc, setNc] = useState({ nome: '', telefone: '' });
  const [profissionalId, setProfissionalId] = useState(alvo?.profissionalId || inicial.profissionalId || (user.papel === 'profissional' ? user.id : profissionais[0]?.id) || '');
  const [data, setData] = useState(ymd(alvo ? alvo.inicio : inicial.dayTs || startOfDay(agora)));
  const [minutos, setMinutos] = useState(() => {
    if (alvo) return new Date(alvo.inicio).getHours() * 60 + new Date(alvo.inicio).getMinutes();
    if (inicial.minutos != null) return Math.max(0, Math.min(1430, inicial.minutos));
    return 9 * 60;
  });
  const [servicoIds, setServicoIds] = useState(alvo ? alvo.servicoIds : []);
  const [chaveCupom, setChaveCupom] = useState('');
  const [status, setStatus] = useState(alvo ? alvo.status === STATUS.CANCELADO ? STATUS.A_CONFIRMAR : alvo.status : STATUS.A_CONFIRMAR);
  const [encaixe, setEncaixe] = useState(alvo ? alvo.encaixe : false);
  const [boxId, setBoxId] = useState(''); // vazio = o mesmo box, se estiver livre; senão, o app escolhe
  const [tentou, setTentou] = useState(false);
  const [erros, setErros] = useState([]);

  const inicio = data ? tsAt(fromYmd(data), minutos) : null;
  const v = useMemo(() => (inicio && profissionalId ? agenda.validar({ profissionalId, inicio, servicoIds, porte: alvo?.porte, boxId: boxId || undefined, boxPreferido: alvo?.boxId || undefined, encaixe, ignoreId: remarcarId }) : null), [inicio, profissionalId, servicoIds, boxId, encaixe, remarcarId, st]);
  const servicos = porUltimoUso(st.servicos.filter((s) => s.ativo !== false || servicoIds.includes(s.id)), agendamentosVisiveis(st, user), 'servico');
  const sel = servicosPorIds(st, servicoIds, alvo?.porte);
  const nomeDe = (a) => `${nomeCliente(st, a)} às ${fmtHM(a.inicio)}`;
  const [avisar, setAvisar] = useState(null); // { tel, texto }: pergunta se avisa o cliente depois de remarcar
  const hasServico = servicoIds.length > 0;
  const bloqueios = v ? v.erros.filter((e) => hasServico || !/serviço/i.test(e)) : [];
  const efetivas = hasServico ? notificacoesEfetivas(sel, st.estabelecimento).lista : [];

  const salvar = () => {
    setTentou(true);
    if (!remarcarId && !novo && !clienteId) { setErros(['Escolha o cliente.']); rolarAoErro(); return; }
    let cid = clienteId;
    if (!remarcarId && novo) {
      const r = apiClientes.salvar({ nome: nc.nome, telefone: nc.telefone });
      if (!r.ok) { setErros(r.erros); rolarAoErro(); return; }
      cid = r.cliente.id;
    }
    const r = remarcarId
      ? agenda.remarcar(remarcarId, { inicio, status, profissionalId, boxId: boxId || undefined })
      : agenda.criar({ clienteId: cid, profissionalId, servicoIds, inicio, status, encaixe, cupomChave: chaveCupom.trim() || undefined });
    if (!r.ok) { setErros(r.erros); rolarAoErro(); return; }
    toast(remarcarId ? 'Agendamento remarcado.' : 'Agendamento criado.');
    onSalvo && onSalvo(r.agendamento);
    // remarcou o horário de um cliente com telefone: pergunta (na própria tela) se quer avisar pelo WhatsApp; sem telefone ou sem cadastro, avisa na tela que não dá para avisar
    if (remarcarId && alvo && inicio !== alvo.inicio) {
      const cli = st.clientes.find((c) => c.id === alvo.clienteId);
      const tel = cli && numeroWhatsapp(cli.telefone) ? cli.telefone : '';
      if (tel) {
        const e = st.estabelecimento;
        const mostra = e.enderecoNoLink !== false;
        setAvisar({ tel, texto: textoReagendamento({ nomeEstab: e.nome, nomeCliente: cli.apelido || cli.nome, servicos: nomeServicos(st, alvo), dataHora: `${fmtDayLong(inicio)}, às ${fmtHM(inicio)}`, endereco: e.endereco || '', mapaUrl: mostra ? mapaDaLoja(e) : '' }) });
        return;
      }
      setAvisar({ semTelefone: true }); // sem telefone (ou sem cadastro): diz isso em vez de fechar em silêncio
      return;
    }
    onClose();
  };
  // Chamado direto do clique (sem await antes): o navegador só deixa abrir a aba nova nesse momento.
  const avisarCliente = () => { const abriu = abrirWhatsapp(avisar.texto, avisar.tel); if (!abriu) toast('Não foi possível abrir o WhatsApp.', 'erro'); onClose(); };

  if (avisar && avisar.semTelefone) {
    return (
      <Modal titulo="Cliente sem telefone" sub={alvo ? nomeCliente(st, alvo) : undefined} onClose={onClose}
        rodape={<Btn variante="primario" onClick={onClose} data-testid="avisar-sem-telefone-ok">Entendi</Btn>}>
        <p data-testid="avisar-sem-telefone">O horário foi remarcado, mas este cliente está sem telefone: não dá para avisá-lo pelo WhatsApp. Cadastre o telefone na ficha do cliente para os próximos avisos.</p>
      </Modal>
    );
  }
  if (avisar) {
    return (
      <Modal titulo="Avisar o cliente?" sub={alvo ? nomeCliente(st, alvo) : undefined} onClose={onClose}
        rodape={<><Btn onClick={onClose} data-testid="avisar-whats-nao">Agora não</Btn><Btn variante="primario" icone="msg" onClick={avisarCliente} data-testid="avisar-whats-sim">Avisar no WhatsApp</Btn></>}>
        <p data-testid="avisar-whats-pergunta">O horário foi remarcado. Quer avisar o cliente pelo WhatsApp? Abrimos a conversa com a mensagem pronta; você confere e envia.</p>
        <p className="muted" data-testid="avisar-whats-texto" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{avisar.texto}</p>
      </Modal>
    );
  }
  return (
    <Modal titulo={remarcarId ? 'Remarcar agendamento' : 'Novo agendamento'} sub={remarcarId ? `${nomeCliente(st, alvo)} · ${nomeServicos(st, alvo)}` : undefined} onClose={onClose} largura={640}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-agendamento">{remarcarId ? 'Remarcar' : 'Agendar'}</Btn></>}>
      <div className="form-grade">
        {!remarcarId && (
          <div className="campo-largo">
            {!novo ? (
              <Campo rotulo="Cliente">
                <div className="linha-campos">
                  <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} data-testid="sel-cliente">
                    <option value="">Escolha o cliente…</option>
                    {st.clientes.map((c) => <option key={c.id} value={c.id}>{c.apelido && c.apelido !== c.nome ? `${c.nome} (${c.apelido})` : c.nome}</option>)}
                  </select>
                  <Btn tamanho="sm" icone="plus" onClick={() => setNovo(true)}>Novo cliente</Btn>
                </div>
              </Campo>
            ) : (
              <div className="subcartao">
                <div className="linha-campos">
                  <Campo rotulo="Nome ou apelido"><input value={nc.nome} onChange={(e) => setNc({ ...nc, nome: e.target.value })} data-testid="nc-nome" /></Campo>
                  <Campo rotulo="Telefone (WhatsApp)"><input value={nc.telefone} inputMode="tel" placeholder="(55) 99999-9999" onChange={(e) => setNc({ ...nc, telefone: e.target.value })} data-testid="nc-tel" /></Campo>
                </div>
                <Btn tamanho="sm" onClick={() => setNovo(false)}>Usar cliente cadastrado</Btn>
              </div>
            )}
          </div>
        )}

        {!remarcarId && <Campo rotulo="Cupom ou vale (chave, opcional)"><input value={chaveCupom} maxLength={20} autoComplete="off" onChange={(e) => setChaveCupom(e.target.value)} placeholder="XXXX-XXXX-XXXX" data-testid="cupom-chave-novo" /></Campo>}
        <Campo rotulo={Rot('profissional')}>
          <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)} disabled={user.papel === 'profissional'} data-testid="sel-profissional">
            {profissionais.map((b) => <option key={b.id} value={b.id}>{b.apelido || b.nome}</option>)}
          </select>
        </Campo>
        {remarcarId && alvo?.boxId && boxesAtivos(st).length > 1 && (
          <Campo rotulo="Box" dica={v && v.boxId ? `Vai para o ${nomeBox(st, v.boxId)}.` : undefined}>
            <select value={boxId} onChange={(e) => setBoxId(e.target.value)} data-testid="remarcar-box">
              <option value="">Manter ({nomeBox(st, alvo.boxId)}) se estiver livre</option>
              {boxesAtivos(st).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Data">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} data-testid="data" />
        </Campo>

        <div className="campo-largo grupo-hora">
          <div className="campo"><span className="campo-rotulo">Hora</span><SeletorHora valor={minutos} onChange={setMinutos} /></div>
          <div className="grupo-hora-avisos" aria-live="polite">
            {v && hasServico && v.pendentes.length > 0 && (
              <p className="msg-conflito" data-testid="aviso-pendente"><Icon n="alert" size={15} /> Já há {v.pendentes.length === 1 ? 'um agendamento a confirmar' : `${v.pendentes.length} agendamentos a confirmar`} nesse horário ({v.pendentes.map(nomeDe).join(', ')}). Pode salvar: quem confirmar primeiro fica com o horário.</p>
            )}
            {v && hasServico && encaixe && v.confirmados.length > 0 && (
              <p className="msg-conflito" data-testid="aviso-confirmado"><Icon n="alert" size={15} /> Encaixe sobre horário já confirmado ({v.confirmados.map(nomeDe).join(', ')}).</p>
            )}
            {v && bloqueios.map((e) => <p key={e} className="msg-conflito" data-testid="erro-horario"><Icon n="alert" size={15} /> {e}</p>)}
            {inicio && hasServico && !bloqueios.length && !(v && (v.pendentes.length || (encaixe && v.confirmados.length))) && <p className="msg-ok"><Icon n="check" size={15} /> Horário livre · {v?.retirada && v.dias > 1 ? `retirada prevista ${fmtDate(v.retirada)} ${fmtHM(v.retirada)}` : `${fmtHM(inicio)} às ${fmtHM(v?.retirada || inicio + (v?.duracao || 0) * MIN)}`}{v?.boxId ? ` · ${nomeBox(st, v.boxId)}` : ''}</p>}
          </div>
        </div>

        {!remarcarId ? (
          <fieldset className="campo-largo conj">
            <legend>Serviços</legend>
            <div className="servicos-coluna">
              {servicos.map((s) => {
                const on = servicoIds.includes(s.id);
                return (
                  <div key={s.id} className={`servico-linha ${on ? 'on' : ''}`}>
                    <label className="servico-op-lado">
                      <input type="checkbox" checked={on} onChange={() => setServicoIds((ids) => (ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id]))} data-testid={`srv-${s.id}`} />
                      <span><b>{s.nome}</b><small className="muted">{fmtMoney(s.preco)} · {fmtDuration(s.duracao)}</small></span>
                    </label>
                  </div>
                );
              })}
            </div>
            {hasServico && (
              <div className="resumo-valores" data-testid="resumo-valores">
                <span className="muted">{fmtDuration(duracaoMin(sel))} de atendimento (+ {fmtDuration(ocupadoMin(sel) - duracaoMin(sel))} de intervalo)</span>
                <dl><div><dt>Serviços</dt><dd>{fmtMoney(totalPreco(sel))}</dd></div><div className="total"><dt>Total</dt><dd>{fmtMoney(totalPreco(sel))}</dd></div></dl>
              </div>
            )}
          </fieldset>
        ) : null}

        <fieldset className="campo-largo conj">
          <legend>Status</legend>
          <div className="radios">
            {[[STATUS.A_CONFIRMAR, 'A confirmar'], [STATUS.CONFIRMADO, 'Confirmado'], [STATUS.CONCLUIDO, 'Concluído']].map(([k, r]) => (
              <label key={k} className={`radio-op ${status === k ? 'on' : ''}`}><input type="radio" name="status" checked={status === k} onChange={() => setStatus(k)} data-testid={`status-${k}`} />{r}</label>
            ))}
          </div>
          <p className="muted dica-status">
            {status === STATUS.A_CONFIRMAR
              ? (hasServico && !efetivas.length ? 'Sem notificações configuradas: nenhuma mensagem será enviada ao cliente.' : 'O cliente recebe a pergunta de confirmação pelo WhatsApp, conforme as notificações configuradas.')
              : 'Nenhuma mensagem é enviada ao cliente.'}
          </p>
        </fieldset>

        {!remarcarId && (
          <label className="encaixe-op campo-largo">
            <input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} data-testid="encaixe" />
            <span><b>Encaixe</b><small className="muted">Força o horário mesmo sobre outro agendamento (inclusive confirmado). Só vale pelo painel.</small></span>
          </label>
        )}
      </div>
      {(erros.length > 0 || (tentou && !remarcarId && !hasServico)) && (
        <Aviso tipo="erro">{[...erros, ...(tentou && !remarcarId && !hasServico && !erros.length ? ['Escolha ao menos um serviço.'] : [])].map((e) => <div key={e}>{e}</div>)}</Aviso>
      )}
    </Modal>
  );
}

const nomeDe = (st, id) => { const u = st.usuarios.find((x) => x.id === id); return u ? u.apelido || u.nome : '—'; };
// Nome de quem vendeu o produto, só quando não é o profissional do atendimento (senão não precisa dizer).
const vendedorDoProduto = (st, a, materialId) => { const l = (a.produtos || []).find((x) => x.materialId === materialId); return l && l.vendedorId && l.vendedorId !== a.profissionalId ? nomeDe(st, l.vendedorId) : ''; };

// Acrescenta serviços e produtos a um agendamento ou atendimento local sem mudar o status.
function AdicionarItens({ a, st, user }) {
  const [srv, setSrv] = useState('');
  const [prod, setProd] = useState('');
  const [qtd, setQtd] = useState(1);
  const [vend, setVend] = useState('');
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const visiveis = agendamentosVisiveis(st, user);
  // Últimos usados primeiro; a lupa filtra as duas listas por nome ou código.
  const livres = servicosNaOrdemDaLoja(st, st.servicos.filter((s) => s.ativo !== false && !a.servicoIds.includes(s.id))).filter((s) => casaBusca(s, busca));
  const produtos = porUltimoUso(st.materiais.filter((m) => m.tipo === 'produto' && m.ativo !== false), visiveis, 'produto').filter((m) => casaBusca(m, busca));
  const ver = (r, ok) => { if (r.ok) { toast(ok); return true; } toast(r.erros[0], 'erro'); return false; };
  return (
    <section className="bloco" data-testid="adicionar-itens">
      <div className="lista-itens-cab"><h3>Adicionar ao atendimento</h3>
        <button type="button" className="icone-btn" onClick={() => { setAberta(!aberta); if (aberta) setBusca(''); }} aria-expanded={aberta} aria-label="Pesquisar serviço ou produto por nome ou código" title="Pesquisar por nome ou código" data-testid="add-lupa"><Icon n={aberta ? 'x' : 'search'} size={17} /></button></div>
      {aberta && <input type="search" className="busca" placeholder="Nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar serviço ou produto" data-testid="add-busca" autoFocus />}
      <p className="muted">O status do agendamento não muda.</p>
      <div className="linha-campos">
        <select value={srv} onChange={(e) => setSrv(e.target.value)} aria-label="Serviço a adicionar" data-testid="add-servico-sel">
          <option value="">Serviço…</option>
          {livres.map((s) => <option key={s.id} value={s.id}>{s.codigo} · {s.nome} · {fmtMoney(s.preco)}</option>)}
        </select>
        <Btn tamanho="sm" icone="plus" disabled={!srv} onClick={() => { if (ver(agenda.adicionarServicos(a.id, [srv]), 'Serviço adicionado.')) setSrv(''); }} data-testid="add-servico">Adicionar serviço</Btn>
      </div>
      {produtos.length > 0 && (
        <div className="linha-campos">
          <select value={prod} onChange={(e) => setProd(e.target.value)} aria-label="Produto a adicionar" data-testid="add-produto-sel">
            <option value="">Produto…</option>
            {produtos.map((m) => <option key={m.id} value={m.id}>{m.codigo} · {m.nome} · {fmtMoney(m.preco)} · restam {m.estoque}</option>)}
          </select>
          <input type="number" min="1" max="999" step="1" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade" style={{ maxWidth: 80 }} data-testid="add-produto-qtd" />
          {user.papel !== 'profissional' && (
            <select value={vend} onChange={(e) => setVend(e.target.value)} aria-label="Vendedor do produto" data-testid="add-produto-vendedor">
              <option value="">{user.podeVender !== false ? 'Vendedor: eu' : `Vendedor: o ${rot('profissional')}`}</option>
              {st.usuarios.filter((u) => u.papel !== 'master' && u.podeVender !== false && u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.apelido || u.nome}</option>)}
            </select>
          )}
          <Btn tamanho="sm" icone="plus" disabled={!prod} onClick={() => { if (ver(agenda.adicionarProduto(a.id, { materialId: prod, qtd: Number(qtd), vendedorId: vend || undefined }), 'Produto adicionado.')) { setProd(''); setQtd(1); setVend(''); } }} data-testid="add-produto">Adicionar produto</Btn>
        </div>
      )}
    </section>
  );
}

const ESTADO_PLANO = { pendente: 'Agendada', enviada: 'Enviada', pulada: 'Não será enviada' };

function textoQuando(n) {
  return n.modo === 'dias' ? `${n.dias} ${n.dias === 1 ? 'dia' : 'dias'} antes, às ${n.hora}` : `${n.horas} h antes`;
}

export function GavetaAgendamento({ id, user, onClose, onRemarcar }) {
  const { state: st, agora } = useStore();
  const a = st.agendamentos.find((x) => x.id === id);
  const [confirmaCancel, setConfirmaCancel] = useState(false);
  const [editaServ, setEditaServ] = useState(null);
  const [feitos, setFeitos] = useState(null);
  const [msgModelo, setMsgModelo] = useState('');
  const [vals, setVals] = useState([]);
  const [mais, setMais] = useState(false);
  const [chaveCupom, setChaveCupom] = useState('');
  const [erroCupom, setErroCupom] = useState('');
  const [cancelandoCom, setCancelandoCom] = useState(null); // quem (id) está com o motivo do cancelamento da comissão aberto
  const [motivoCom, setMotivoCom] = useState('');
  const [erroCom, setErroCom] = useState('');
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f); }, [onClose]);
  if (!a) return null;
  const c = clienteDe(st, a);
  const b = profissionalDe(st, a);
  const sv = servicosPorIds(st, a.servicoIds, a.porte);
  const v = visualDoCartao(a, agora);
  const oc = !a.local && a.servicoIds.length ? ocupacaoDe(st, a) : null;
  const ativo = a.status !== STATUS.CANCELADO;
  const itensCupom = itensDoAgendamento(st, a);
  const descontoCupom = somaItens(itensCupom).descontos;
  const local = !!a.local;
  const paga = comissaoJaPaga(a);
  const partes = a.status !== STATUS.CANCELADO ? partesDoAgendamento(st, a) : [];
  const msgs = st.mensagensCliente.filter((m) => m.agendamentoId === a.id);
  const exigeServico = exigeConfirmacaoServico(sv, st.estabelecimento);
  const modelo = st.modelos.find((m) => m.id === msgModelo);
  const padrao = modelo ? valoresPadraoModelo(st, a, modelo) : [];
  const valores = modelo ? variaveisDoCorpo(modelo.corpo).filter((x, i, arr) => arr.indexOf(x) === i).map((n) => (vals[n - 1] ?? padrao[n - 1] ?? '')) : [];
  const executa = (r, ok) => { if (r.ok) { toast(ok); return true; } toast(r.erros[0], 'erro'); return false; };

  return (
    <>
      <div className="gaveta-fundo" onClick={onClose} />
      <aside className="gaveta" role="dialog" aria-label="Detalhes do agendamento" data-testid="gaveta">
        <header className="gaveta-topo">
          <div>
            <p className="eyebrow">{fmtDate(a.inicio)} às {fmtHM(a.inicio)}</p>
            <h2>{nomeCliente(st, a)}</h2>
          </div>
          <button type="button" className="icone-btn" onClick={onClose} aria-label="Fechar"><Icon n="x" /></button>
        </header>
        <div className="gaveta-corpo">
          <div className="gaveta-status"><StatusChip a={a} agora={agora} />{a.statusManual && a.statusManual.inicio === a.inicio && <span className="muted" data-testid="status-manual">Status escolhido por você: o sistema não altera sozinho.</span>}<Etiquetas a={a} />{a.motivoCancelamento === 'conflito' && <span className="chip chip-p">Horário ocupado por outro cliente</span>}</div>

          {a.clienteAgendou && a.status === STATUS.A_CONFIRMAR && (
            <div className="bloco" data-testid="pedido-do-link">
              <Aviso tipo="info"><b>O cliente pediu este horário pelo link.</b> Confirme ou recuse; o horário já está reservado para ele.</Aviso>
              <div className="pub-linha">
                <Btn variante="primario" icone="check" onClick={() => executa(agenda.alterarStatus(a.id, 'confirmado'), 'Horário confirmado.')} data-testid="confirmar-pedido">Confirmar</Btn>
                <Btn variante="perigo" icone="x" onClick={() => executa(agenda.cancelar(a.id), 'Pedido recusado. O cliente foi avisado.')} data-testid="recusar-pedido">Recusar</Btn>
              </div>
            </div>
          )}

          {a.faltaConfirmacao && a.status === STATUS.A_CONFIRMAR && (
            <Aviso tipo="erro"><b>Falta de confirmação.</b> {textoSemConfirmacao(st, a)}</Aviso>
          )}

          <dl className="ficha">
            <div><dt>{Rot('profissional')}</dt><dd>{b?.apelido || b?.nome}</dd></div>
            {a.veiculo && <div><dt>Veículo</dt><dd data-testid="ficha-veiculo">{rotuloVeiculo(a.veiculo)} <span className="muted">· porte {ROTULO_PORTE[a.porte]?.toLowerCase()}</span></dd></div>}
            {a.boxId && <div><dt>Box</dt><dd data-testid="ficha-box">{nomeBox(st, a.boxId) || '—'}</dd></div>}
            {oc && oc.dias > 1 && <div><dt>Retirada</dt><dd data-testid="ficha-retirada">Entrada {fmtDate(a.inicio)} {fmtHM(a.inicio)} · retirada prevista {fmtDate(oc.retirada)} {fmtHM(oc.retirada)} <span className="muted">({oc.dias} dias de trabalho)</span></dd></div>}
            {sv.length > 0 && (
              <div><dt>Serviços</dt><dd>
                <ul className="valores-lista" data-testid="valores-gaveta">
                  {sv.map((s) => (
                    <li key={s.id}>
                      <span className="v-linha"><span>{s.nome}</span><b>{fmtMoney(a.precos?.[s.id] ?? s.preco)}</b></span>
                      {a.acrescimos?.[s.id] > 0 && <span className="v-linha acr"><span>Acréscimo</span><b>+ {fmtMoney(a.acrescimos[s.id])}</b></span>}
                      {(itensCupom.find((i) => i.id === s.id)?.desconto || 0) > 0 && <span className="v-linha desc" data-testid="linha-desconto"><span>Cupom {a.cupom?.nome}</span><b>− {fmtMoney(itensCupom.find((i) => i.id === s.id).desconto)}</b></span>}
                    </li>
                  ))}
                </ul>
                <span className="v-total"><span className="muted">{(sv.some((x) => x.multiDia) && oc ? `${oc.dias} dias` : fmtDuration(duracaoMin(sv)))} · Serviços {fmtMoney(sv.reduce((t, s) => t + (a.precos?.[s.id] ?? s.preco), 0))}{totalAcrescimos(a) > 0 ? ` + acréscimos ${fmtMoney(totalAcrescimos(a))}` : ''}</span><b data-testid="total-gaveta">Total {fmtMoney(sv.reduce((t, s) => t + (a.precos?.[s.id] ?? s.preco), 0) + totalAcrescimos(a) - descontoCupom)}</b></span>
              </dd></div>
            )}
            {(a.produtos || []).length > 0 && (
              <div><dt>Produtos</dt><dd>
                <ul className="valores-lista" data-testid="produtos-gaveta">
                  {produtosDoAgendamento(st, a).map((p) => (
                    <li key={p.id}><span className="v-linha"><span>{p.qtd}× {p.nome}{vendedorDoProduto(st, a, p.id) && <small className="muted" data-testid={`vendedor-${p.id}`}> · vendido por {vendedorDoProduto(st, a, p.id)}</small>}</span><b>{fmtMoney(p.valor)}</b></span>
                      {!paga && <Btn tamanho="sm" icone="trash" onClick={() => executa(agenda.removerProduto(a.id, p.id), 'Produto retirado.')} aria-label={`Retirar ${p.nome}`} data-testid={`rm-produto-${p.id}`}>Retirar</Btn>}</li>
                  ))}
                </ul>
                <span className="v-total"><span className="muted">Produtos {fmtMoney(totalProdutos(st, a))}</span><b data-testid="total-com-produtos">Total com produtos {fmtMoney(sv.reduce((t, s) => t + (a.precos?.[s.id] ?? s.preco), 0) + totalAcrescimos(a) - descontoCupom + totalProdutos(st, a))}</b></span>
              </dd></div>
            )}
            {a.retroativo && (
              <div><dt>Lançamento</dt><dd data-testid="a-retroativo">Lançado depois, em {fmtDateTime(a.retroativo.lancadoEm)}: {a.retroativo.motivo}{a.retroativo.proximoPagamento ? ' · a comissão entra no próximo pagamento.' : ''}</dd></div>
            )}
            {partes.length > 0 && (
              <div><dt>{user.papel === 'profissional' ? 'Valor a receber' : 'Comissão'}</dt><dd data-testid="a-receber">
                {user.papel === 'profissional' ? (
                  <><b data-testid="a-receber-valor">{fmtMoney(partes.filter((p) => p.quem === user.id).reduce((t, p) => t + p.comissao, 0))}</b>{partes.some((p) => p.quem === user.id && p.paga) && <span className="muted"> · já pago</span>}</>
                ) : (
                  <>
                    {partes.map((p) => (
                      <span key={p.quem} className="v-linha" data-testid={`comissao-${p.quem}`}>
                        <span>{nomeDe(st, p.quem)}{p.itens.length === 0 ? ' (venda)' : p.produtos.length ? ' (serviços e vendas)' : ''}</span>
                        <b {...(p.quem === a.profissionalId ? { 'data-testid': 'a-receber-valor' } : {})}>{fmtMoney(p.comissao)}{p.paga && <span className="muted"> · já pago</span>}{p.cancelada && <span className="muted" data-testid={`comissao-cancelada-${p.quem}`}> · cancelada ({p.motivoCancelada})</span>}</b>
                        {ehDono(user) && p.cancelada && <Btn tamanho="sm" onClick={() => executa(comissoes.restaurar(a.id, { quem: p.quem }), 'Comissão restaurada.')} data-testid={`comissao-restaurar-${p.quem}`}>Restaurar</Btn>}
                        {ehDono(user) && !p.cancelada && !p.paga && p.comissao > 0 && cancelandoCom !== p.quem && <Btn tamanho="sm" onClick={() => { setCancelandoCom(p.quem); setMotivoCom(''); setErroCom(''); }} data-testid={`comissao-cancelar-${p.quem}`}>Cancelar comissão</Btn>}
                        {ehDono(user) && cancelandoCom === p.quem && (
                          <span className="campo-largo" style={{ flexBasis: '100%' }}>
                            <input type="text" maxLength={300} value={motivoCom} onChange={(e) => setMotivoCom(e.target.value)} placeholder="Motivo do cancelamento da comissão (obrigatório)" aria-label="Motivo do cancelamento da comissão" data-testid="comissao-motivo" />
                            {erroCom && <span className="msg-conflito" data-testid="comissao-erro">{erroCom}</span>}
                            <Btn tamanho="sm" onClick={() => setCancelandoCom(null)}>Voltar</Btn>
                            <Btn tamanho="sm" variante="perigo" data-testid="comissao-cancelar-ok" onClick={() => { const r = comissoes.cancelar(a.id, { quem: p.quem, motivo: motivoCom }); if (r.ok) { setCancelandoCom(null); toast('Comissão cancelada.'); } else setErroCom(r.erros[0]); }}>Cancelar a comissão</Btn>
                          </span>
                        )}
                      </span>
                    ))}
                    <span className="muted" data-testid="parte-casa">estabelecimento {fmtMoney(partes.reduce((t, p) => t + p.casa, 0))}</span>
                  </>
                )}
              </dd></div>
            )}
            {!a.clienteId ? <div><dt>Cliente</dt><dd>{a.nomeAvulso || 'Sem nome'} {a.telefoneAvulso && <span className="muted">{formatarTelefone(a.telefoneAvulso)} · </span>}<span className="muted">{local ? 'atendimento local, sem cadastro' : 'horário sem cadastro (confirmado, sem aviso ao cliente)'}</span></dd></div> : (
              <>
                <div><dt>Cliente</dt><dd>{c?.nome} <span className="muted">{c?.telefone}</span></dd></div>
                <div><dt>Histórico do cliente</dt><dd>{textoUltimo(st, a)}</dd></div>
              </>
            )}
            <div><dt>Origem</dt><dd>{local ? 'Local (balcão)' : a.origem === 'whatsapp' ? 'WhatsApp' : 'Painel'}{a.encaixe ? ' · encaixe' : ''}{a.fixoId ? ' · horário fixo do plano' : ''}</dd></div>
            {destinosCalendario(st, a).length > 0 && <div><dt>Google Agenda</dt><dd>Evento enviado para {destinosCalendario(st, a).join(' e ')}</dd></div>}
          </dl>

          {ativo && !paga && <AdicionarItens a={a} st={st} user={user} />}
          {ativo && paga && <p className="muted" data-testid="comissao-travada">A comissão deste atendimento já foi paga: não dá mais para mudar serviços nem produtos. Para um item esquecido, abra um novo atendimento só com ele.</p>}

          {!local && capAtiva('prontoParaRetirada') && a.status === STATUS.CONFIRMADO && a.servicoIds.length > 0 && (
            <section className="bloco" data-testid="andamento">
              <h3>Andamento do carro</h3>
              <div className="acoes">
                {!a.emServico && !a.pronto && <Btn icone="car" onClick={() => executa(agenda.iniciarServico(a.id), 'Serviço iniciado.')} data-testid="iniciar-servico">Iniciar serviço</Btn>}
                {!a.pronto && <Btn variante="primario" icone="check" onClick={() => executa(agenda.marcarPronto(a.id), 'Marcado como pronto. O cliente foi avisado que o carro está pronto.')} data-testid="marcar-pronto">Pronto para retirada</Btn>}
                {a.emServico && !a.pronto && <Btn tamanho="sm" onClick={() => executa(agenda.desmarcarAndamento(a.id, 'emServico'), 'Marcador "Em serviço" desfeito.')} data-testid="desfazer-em-servico">Desfazer "Em serviço"</Btn>}
                {a.pronto && <Btn tamanho="sm" onClick={() => executa(agenda.desmarcarAndamento(a.id, 'pronto'), 'Marcador "Pronto para retirada" desfeito.')} data-testid="desfazer-pronto">Desfazer "Pronto"</Btn>}
              </div>
              <p className="muted">{a.pronto ? 'Pronto para retirada: se o cliente não for confirmado como retirado, o atendimento conclui sozinho 24 h depois do aviso.' : a.emServico ? 'O carro está no box. Ao terminar, marque como pronto para retirada.' : 'Marque quando o carro entrar no box e quando estiver pronto.'}</p>
            </section>
          )}

          {!local && [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && (
            <div className="cupom-ag" data-testid="cupom-ag">
              {a.cupom ? (
                <p><Icon n="tag" size={15} /> <b>Cupom: {a.cupom.nome}</b> — desconto de {fmtMoney(descontoCupom)} <Btn tamanho="sm" onClick={() => { const r = agenda.retirarCupom(a.id); if (!r.ok) toast(r.erros[0], 'erro'); }} data-testid="cupom-retirar">Retirar cupom</Btn></p>
              ) : (
                <div className="cupom-campo">
                  <Campo rotulo="Cupom ou vale (chave)"><input value={chaveCupom} maxLength={20} autoComplete="off" onChange={(e) => { setChaveCupom(e.target.value); setErroCupom(''); }} placeholder="XXXX-XXXX-XXXX" data-testid="cupom-chave-ag" /></Campo>
                  <Btn onClick={() => { const r = agenda.aplicarCupom(a.id, chaveCupom); if (r.ok) { setChaveCupom(''); toast(`Cupom aplicado: desconto de ${fmtMoney(r.desconto)}.`); } else setErroCupom(r.erros[0]); }} data-testid="cupom-aplicar">Aplicar</Btn>
                </div>
              )}
              {erroCupom && <Aviso tipo="erro">{erroCupom}</Aviso>}
            </div>
          )}

          {ativo && (
            <div className="acoes">
              {!local && a.status !== STATUS.CONCLUIDO && <Btn variante="primario" icone="repeat" onClick={() => onRemarcar(a.id)} data-testid="acao-remarcar">Remarcar</Btn>}
              {!confirmaCancel ? <Btn variante="perigo" icone="x" onClick={() => setConfirmaCancel(true)} data-testid="acao-cancelar">Cancelar</Btn> : (
                <span className="confirmar-cancel">
                  <b>Cancelar este horário?</b>
                  <Btn variante="perigo" tamanho="sm" onClick={() => { if (executa(agenda.cancelar(a.id), 'Agendamento cancelado.')) setConfirmaCancel(false); }} data-testid="acao-cancelar-sim">Sim, cancelar</Btn>
                  <Btn tamanho="sm" onClick={() => setConfirmaCancel(false)}>Voltar</Btn>
                </span>
              )}
            </div>
          )}

          {a.status === STATUS.CONFIRMADO && exigeServico && (
            <section className="bloco">
              <h3>{Voc('confirmacao')}</h3>
              <p className="muted">Marque o que foi feito para concluir o atendimento.</p>
              {(() => { const f = feitos || a.servicoIds; return (
                <>
                  <div className="servicos-lista">{sv.map((s) => (
                    <label key={s.id} className="servico-op on"><input type="checkbox" checked={f.includes(s.id)} onChange={() => setFeitos(f.includes(s.id) ? f.filter((x) => x !== s.id) : [...f, s.id])} /><span><b>{s.nome}</b></span></label>
                  ))}</div>
                  <Btn variante="sucesso" icone="check" onClick={() => executa(agenda.confirmarServico(a.id, f), 'Atendimento concluído.')} data-testid="confirmar-servico">Concluir atendimento</Btn>
                </>
              ); })()}
            </section>
          )}

          {!local && usaIntegracaoPix(st) && <Pagamento a={a} st={st} user={user} />}

          {!local && <section className="bloco">
            <h3>Mensagem ao cliente</h3>
            <div className="linha-campos">
              <select value={msgModelo} onChange={(e) => { setMsgModelo(e.target.value); setVals([]); }} aria-label="Modelo de mensagem" data-testid="msg-modelo">
                <option value="">Escolha um modelo…</option>
                {st.modelos.filter((m) => !MODELOS_SO_AUTOMATICOS.includes(m.chave)).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            {modelo && (
              <>
                <div className="balao-previa"><p>{renderizar(modelo, valores)}</p>{modelo.botoes.length > 0 && <div className="balao-botoes">{modelo.botoes.map((x) => <span key={x}>{x}</span>)}</div>}</div>
                <Btn icone="send" tamanho="sm" onClick={() => executa(agenda.enviarMensagem(a.id, modelo.id, valores), 'Mensagem enviada ao cliente.')} data-testid="enviar-msg">Enviar pelo WhatsApp</Btn>
              </>
            )}
            {msgs.length > 0 && (
              <ul className="lista-msgs">
                {msgs.slice(0, 6).map((m) => <li key={m.id}><span className="muted">{fmtDateTime(m.em)} · {m.modeloNome}</span></li>)}
              </ul>
            )}
          </section>}

          {a.status === STATUS.A_CONFIRMAR && a.plano.length > 0 && (
            <section className="bloco">
              <h3>Notificações deste agendamento</h3>
              <ul className="plano">
                {a.plano.map((p) => (
                  <li key={p.idx} className={`p-${p.estado}`}>
                    <span>{p.tipo === 'pergunta' ? 'Pergunta de confirmação' : 'Aviso'}</span>
                    <span className="muted">{p.estado === 'pulada' ? ESTADO_PLANO.pulada : `${ESTADO_PLANO[p.estado]} · ${fmtDateTime(p.enviarEm)}`}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bloco">
            <h3>Histórico</h3>
            <ol className="log">
              {[...a.log].reverse().map((l) => (
                <li key={l.id}>
                  <span className="log-quando">{fmtDateTime(l.em)}</span>
                  <span><b>{campoLog[l.campo] || l.campo}</b>{l.de ? <>: {l.de} <Icon n="right" size={12} /> {l.para}</> : <>: {l.para}</>}</span>
                  <span className="muted">por {l.autor.tipo === 'sistema' ? 'Sistema' : `${l.autor.nome} (${l.autor.tipo})`}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="mais">
            <button type="button" className="link" onClick={() => setMais(!mais)} aria-expanded={mais}>{mais ? 'Menos opções' : 'Mais opções (corrigir status, trocar serviços)'}</button>
            {mais && (
              <div className="bloco">
                {!local && <Campo rotulo="Corrigir status" dica="Use quando algo deu errado, por exemplo um atendimento que não aconteceu.">
                  <select value={a.status} onChange={(e) => executa(agenda.alterarStatus(a.id, e.target.value), 'Status alterado.')} data-testid="corrigir-status">
                    {Object.entries(ROTULO_STATUS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                  </select>
                </Campo>}
                {!paga && <div className="campo campo-itens">
                  <ListaItens titulo="Serviços realizados" testid="ficha-lista-servicos" className="conj lista-itens" itens={porUltimoUso(st.servicos.filter((s) => s.ativo !== false || a.servicoIds.includes(s.id)), agendamentosVisiveis(st, user), 'servico')} selecionado={(s) => (editaServ || a.servicoIds).includes(s.id)} renderItem={(s) => {
                    const cur = editaServ || a.servicoIds;
                    return <label key={s.id} className={`servico-op ${cur.includes(s.id) ? 'on' : ''}`}><input type="checkbox" checked={cur.includes(s.id)} onChange={() => setEditaServ(cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id])} /><span><b>{s.nome}</b><small className="muted"> cód. {s.codigo}</small></span></label>;
                  }} />
                  {editaServ && <Btn tamanho="sm" onClick={() => { if (executa(agenda.editarServicos(a.id, editaServ), 'Serviços atualizados.')) setEditaServ(null); }}>Salvar serviços</Btn>}
                </div>}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
