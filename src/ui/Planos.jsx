/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Menu Planos: catálogo de planos mensais, assinaturas dos clientes (mensalidade, saldo de cortes, extrato) e pedidos que chegam pelo link de planos.
// O pagamento é direto com o profissional: aqui só se registra. O saldo vem do servidor (derivado dos atendimentos), nunca é digitado.
import React, { useState } from 'react';
import { planos as api } from '../services/api.js';
import { FORMAS_PAGAMENTO } from '../domain/rules.js';
import { ADIANTA_MAX, ACUMULO_MAX, DIAS_FIXOS_A_FRENTE, VALIDADE_MAX, INTERVALO_MAX, CORTES_MAX, MAX_FIXOS, SITUACAO, rotuloMes, somaMeses } from '../domain/planos.js';
import { formularioDoModelo, modelosDePlanoDoTipo } from '../domain/catalogo.js';
import { capAtiva, Rot, tipoDe } from '../domain/tipos.js';
import { DIAS_SEMANA, DIAS_CURTOS } from '../domain/time.js';
import { baseDoLink, montarLinkPlanos } from '../domain/link-publico.js';
import { fmtMoney } from '../domain/time.js';
import { LOJA_TROCAVEL, MODO_DEMO } from '../services/api.js';
import { Abas, Aviso, Btn, Campo, Icon, Modal, Vazio } from './common.jsx';
import PickerCliente from './PickerCliente.jsx';
import Tabela from './Tabela.jsx';
import { toast, useStore } from './hooks.js';

const nomeDe = (c) => (c ? (c.apelido && c.apelido !== c.nome ? `${c.nome} (${c.apelido})` : c.nome) : '—');
async function copiar(texto, aviso) {
  try { await navigator.clipboard.writeText(texto); toast(aviso); } catch { toast('Não consegui copiar sozinho: selecione o texto e copie.', 'erro'); }
}

export default function Planos() {
  const { state: st, loja: lojaSlug } = useStore();
  const [aba, setAba] = useState('assinaturas');
  const [versao, setVersao] = useState(0); // a lista vem da API (o saldo é derivado): recarrega depois de cada ação
  const recarregar = () => setVersao((v) => v + 1);
  const dados = React.useMemo(() => api.listar(), [st, versao]); // eslint-disable-line react-hooks/exhaustive-deps
  // Na demonstração a loja vem de ?loja=<slug> ou, no Artifact, dentro do link (#planos@<loja>); no site real vem do endereço.
  const base = baseDoLink(window.location);
  const lojaDemo = new URLSearchParams(window.location.search).get('loja');
  const busca = lojaDemo && /^[a-z0-9-]{1,40}$/.test(lojaDemo) && base ? `?loja=${lojaDemo}` : '';
  const link = montarLinkPlanos({ base, busca, lojaNoLink: MODO_DEMO && LOJA_TROCAVEL ? lojaSlug : '' });
  if (!dados.ok) return <div className="painel"><Aviso tipo="erro">{dados.erros?.[0] || 'Sem acesso.'}</Aviso></div>;
  return (
    <div className="tela" data-testid="tela-planos">
      <div className="tela-topo">
        <h2>Planos</h2>
        <div className="acoes">
          <Btn icone="copy" onClick={() => copiar(link, 'Link de planos copiado.')} data-testid="planos-copiar-link">Copiar link de planos</Btn>
        </div>
      </div>
      <Abas valor={aba} onChange={setAba} ordem="planos" itens={[['assinaturas', 'Assinaturas'], ['catalogo', 'Planos'], ['pedidos', `Pedidos do link${dados.pedidos.length ? ` (${dados.pedidos.length})` : ''}`]]} />
      {aba === 'assinaturas' && <Assinaturas dados={dados} st={st} recarregar={recarregar} />}
      {aba === 'catalogo' && <Catalogo dados={dados} st={st} recarregar={recarregar} />}
      {aba === 'pedidos' && <Pedidos dados={dados} recarregar={recarregar} />}
    </div>
  );
}

// ---------------------------------------------------------------- assinaturas
function Assinaturas({ dados, st, recarregar }) {
  const [nova, setNova] = useState(false);
  const [pagar, setPagar] = useState(null);
  const [encerrar, setEncerrar] = useState(null);
  const [extrato, setExtrato] = useState(null);
  const [fixos, setFixos] = useState(null);
  const comFixos = true; // horário fixo vale em todas as modalidades (tipo com veículo leva o veículo do cliente)
  const aReceber = dados.assinaturas.filter((a) => dados.aReceber.includes(a.id));
  const situ = (a) => (a.status === 'cancelada' ? (a.divida > 0 && !a.dividaQuitada ? 'Encerrado com dívida' : SITUACAO.cancelada) : a.status === 'pendente' ? SITUACAO.pendente : a.saldo.atrasado ? 'Mensalidade atrasada' : SITUACAO.ativa);
  return (
    <div className="painel" data-testid="aba-assinaturas">
      <div className="tela-topo">
        <h3>Assinaturas</h3>
        <Btn variante="primario" icone="plus" onClick={() => setNova(true)} disabled={!dados.planos.some((p) => p.ativo !== false)} data-testid="nova-assinatura">Nova assinatura</Btn>
      </div>
      {!dados.planos.some((p) => p.ativo !== false) && <Aviso>Crie primeiro um plano na aba “Planos”.</Aviso>}
      {aReceber.length > 0 && (
        <div className="subcartao" data-testid="a-receber">
          <b>A receber em {rotuloMes(dados.mes)}</b>
          {aReceber.map((a) => (
            <div key={a.id} className="linha-campos" data-testid={`a-receber-${a.id}`}>
              <span className="espaco">{nomeDe(a.cliente)} · {a.plano.nome} · <b>{fmtMoney(a.plano.preco)}</b></span>
              <Btn tamanho="sm" onClick={() => setPagar({ a, mes: dados.mes })} data-testid={`receber-${a.id}`}>Registrar mensalidade</Btn>
            </div>
          ))}
        </div>
      )}
      {!dados.assinaturas.length ? <Vazio titulo="Nenhuma assinatura" texto="Escolha um cliente e um plano para começar a cobrar por mês." /> : (
        <Tabela id="assinaturas" testid="tabela-assinaturas" chave={(a) => a.id} linhas={dados.assinaturas} colunas={[
          { id: 'cliente', titulo: 'Cliente', fixa: true, cel: (a) => <b>{nomeDe(a.cliente)}</b> },
          { id: 'plano', titulo: 'Plano', cel: (a) => <>{a.plano.nome}<small className="muted"> {fmtMoney(a.plano.preco)}/mês</small></> },
          { id: 'situacao', titulo: 'Situação', cel: (a) => <span className="chip chip-p" data-testid={`situacao-${a.id}`}>{situ(a)}</span> },
          { id: 'saldo', titulo: 'Atendimentos que restam', cls: 'num', cel: (a) => (a.status === 'ativa' ? <span data-testid={`saldo-${a.id}`}>{a.saldo.restantes} de {a.plano.cortes}{a.saldo.maisPermitidos > 0 ? <small className="muted"> (+{a.saldo.maisPermitidos} adiantável)</small> : null}</span> : '—') },
          { id: 'pagoAte', titulo: 'Pago até', cel: (a) => <>{a.saldo.pagoAte ? rotuloMes(a.saldo.pagoAte) : '—'}{a.saldo.validoAte ? <small className="muted" data-testid={`vale-ate-${a.id}`}> · vale até {rotuloMes(a.saldo.validoAte)}</small> : null}</> },
          ...(comFixos ? [{ id: 'fixos', titulo: 'Horários fixos', cel: (a) => <span data-testid={`fixos-resumo-${a.id}`}>{(a.fixos || []).length ? a.fixos.map((f) => `${DIAS_CURTOS[f.dia]} ${f.hm}`).join(' · ') : '—'}</span> }] : []),
          { id: 'acoes', titulo: 'Ações', cel: (a) => (
            <div className="acoes">
              {a.status !== 'cancelada' && <Btn tamanho="sm" onClick={() => setPagar({ a, mes: dados.mes })} data-testid={`pagar-${a.id}`}>Mensalidade</Btn>}
              {comFixos && a.status !== 'cancelada' && <Btn tamanho="sm" onClick={() => setFixos(a)} data-testid={`fixos-${a.id}`}>Horários fixos</Btn>}
              <Btn tamanho="sm" onClick={() => setExtrato(a)} data-testid={`extrato-${a.id}`}>Extrato</Btn>
              {a.status !== 'cancelada' && <Btn tamanho="sm" variante="perigo" onClick={() => setEncerrar(a)} data-testid={`encerrar-${a.id}`}>Encerrar</Btn>}
              {a.status === 'cancelada' && a.divida > 0 && !a.dividaQuitada && <Btn tamanho="sm" onClick={() => { const r = api.quitar(a.id); if (r.ok) { toast('Dívida quitada.'); recarregar(); } else toast(r.erros[0], 'erro'); }} data-testid={`quitar-${a.id}`}>Quitar dívida</Btn>}
            </div>
          ) },
        ]} />
      )}
      {nova && <FormAssinatura dados={dados} clientes={st.clientes} onClose={() => { setNova(false); recarregar(); }} />}
      {pagar && <FormMensalidade a={pagar.a} mesInicial={pagar.mes} onClose={() => { setPagar(null); recarregar(); }} />}
      {encerrar && <FormEncerrar a={encerrar} onClose={() => { setEncerrar(null); recarregar(); }} />}
      {extrato && <Extrato a={extrato} onClose={() => setExtrato(null)} onChange={recarregar} />}
      {fixos && <FormFixos a={fixos} st={st} onClose={() => { setFixos(null); recarregar(); }} />}
    </div>
  );
}

// Até MAX_FIXOS horários por semana do assinante. O sistema cria o agendamento de cada um com DIAS_FIXOS_A_FRENTE dias de antecedência, gastando 1 atendimento do plano.
export function FormFixos({ a, st, onClose, aoFeito }) {
  const profs = st.usuarios.filter((u) => u.atende);
  const servs = a.plano.servicoIds.map((id) => st.servicos.find((x) => x.id === id)).filter(Boolean);
  const veiculos = (st.clientes.find((c) => c.id === a.clienteId)?.veiculos) || [];
  const comVeiculo = capAtiva('usaVeiculo');
  const [linhas, setLinhas] = useState(() => (a.fixos || []).map((f) => ({ dia: f.dia, hm: f.hm, profissionalId: f.profissionalId, servicoId: f.servicoIds[0], veiculoId: f.veiculoId || '' })));
  const [erro, setErro] = useState('');
  const novo = () => ({ dia: 1, hm: '18:00', profissionalId: profs[0]?.id || '', servicoId: servs[0]?.id || '', veiculoId: veiculos[0]?.id || '' });
  const muda = (i, k, v) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const salvar = () => {
    const r = api.definirFixos(a.id, { fixos: linhas.map((l) => ({ dia: Number(l.dia), hm: l.hm, profissionalId: l.profissionalId, servicoIds: [l.servicoId], ...(comVeiculo && l.veiculoId ? { veiculoId: l.veiculoId } : {}) })) });
    if (!r.ok) { setErro(r.erros[0]); return; }
    const msg = r.apagados ? `Horários fixos salvos. ${r.apagados} agendamento(s) que não valem mais saíram da agenda.` : 'Horários fixos salvos.';
    toast(msg); if (aoFeito) aoFeito(msg);
    onClose();
  };
  return (
    <Modal titulo={`Horários fixos · ${nomeDe(a.cliente)}`} onClose={onClose} largura={640} sub={a.plano.nome}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-fixos">Salvar</Btn></>}>
      <p className="muted">Até {MAX_FIXOS} por semana. Cada um vira agendamento {DIAS_FIXOS_A_FRENTE} dias antes, gasta 1 atendimento do plano e fica reservado: ninguém mais consegue marcar esse horário.</p>
      {linhas.length === 0 && <p className="muted" data-testid="fixos-vazio">Nenhum horário fixo.</p>}
      {linhas.map((l, i) => (
        <div key={i} className="subcartao" data-testid={`fixo-linha-${i}`}>
          <div className="form-grade">
            <Campo rotulo="Dia da semana"><select value={l.dia} onChange={(e) => muda(i, 'dia', Number(e.target.value))} data-testid={`fixo-dia-${i}`}>{DIAS_SEMANA.map((d, n) => <option key={n} value={n}>{d}</option>)}</select></Campo>
            <Campo rotulo="Hora"><input type="time" value={l.hm} onChange={(e) => muda(i, 'hm', e.target.value)} data-testid={`fixo-hm-${i}`} /></Campo>
            <Campo rotulo={Rot('profissional')}><select value={l.profissionalId} onChange={(e) => muda(i, 'profissionalId', e.target.value)} data-testid={`fixo-prof-${i}`}>{profs.map((u) => <option key={u.id} value={u.id}>{u.apelido || u.nome}</option>)}</select></Campo>
            {comVeiculo && <Campo rotulo="Veículo"><select value={l.veiculoId} onChange={(e) => muda(i, 'veiculoId', e.target.value)} data-testid={`fixo-veiculo-${i}`}>{veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo} · {v.placa}</option>)}</select></Campo>}
            <Campo rotulo="Serviço do plano"><select value={l.servicoId} onChange={(e) => muda(i, 'servicoId', e.target.value)} data-testid={`fixo-srv-${i}`}>{servs.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
          </div>
          <div className="acoes"><Btn tamanho="sm" variante="perigo" icone="trash" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))} data-testid={`fixo-remover-${i}`}>Remover</Btn></div>
        </div>
      ))}
      {linhas.length < MAX_FIXOS && <Btn icone="plus" onClick={() => setLinhas([...linhas, novo()])} disabled={!profs.length || !servs.length} data-testid="fixo-add">Adicionar horário fixo</Btn>}
      {linhas.length > 0 && <p className="muted">{linhas.length} por semana usam cerca de {linhas.length * 4} atendimentos por mês; o plano dá {a.plano.cortes}. O que passar do saldo não é criado e o aviso chega a você.</p>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

function FormAssinatura({ dados, clientes, onClose }) {
  const ativos = dados.planos.filter((p) => p.ativo !== false);
  const [clienteId, setClienteId] = useState('');
  const [planoId, setPlanoId] = useState(ativos[0]?.id || '');
  const [inicioMes, setInicioMes] = useState(dados.mes);
  const [diaCobranca, setDia] = useState(5);
  const [erro, setErro] = useState('');
  const salvar = () => {
    const r = api.contratar({ clienteId, planoId, inicioMes, diaCobranca });
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast('Assinatura criada. Registre a mensalidade quando receber.');
    onClose();
  };
  return (
    <Modal titulo="Nova assinatura" onClose={onClose} largura={560}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-assinatura">Criar</Btn></>}>
      <div className="form-grade um">
        <PickerCliente clientes={clientes} valor={clienteId} onEscolher={setClienteId} onLimpar={() => setClienteId('')} />
        <Campo rotulo="Plano">
          <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} data-testid="assinatura-plano">
            {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome} · {fmtMoney(p.preco)}/mês · {p.cortes} atendimento{p.cortes > 1 ? 's' : ''}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Começa em">
          <select value={inicioMes} onChange={(e) => setInicioMes(e.target.value)} data-testid="assinatura-inicio">
            {[-2, -1, 0, 1, 2, 3].map((n) => { const m = somaMeses(dados.mes, n); return <option key={m} value={m}>{rotuloMes(m)}</option>; })}
          </select>
        </Campo>
        <Campo rotulo="Dia de cobrança (1 a 28)"><input type="number" min="1" max="28" value={diaCobranca} onChange={(e) => setDia(e.target.value)} data-testid="assinatura-dia" /></Campo>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

export function FormMensalidade({ a, mesInicial, onClose, aoFeito }) {
  const [mes, setMes] = useState(mesInicial);
  const [forma, setForma] = useState('pix');
  const [erro, setErro] = useState('');
  const salvar = () => {
    const r = api.pagar(a.id, { mes, forma });
    if (!r.ok) { setErro(r.erros[0]); return; }
    const msg = `Mensalidade de ${rotuloMes(mes)} registrada.`;
    toast(msg); if (aoFeito) aoFeito(msg);
    onClose();
  };
  return (
    <Modal titulo={`Mensalidade · ${nomeDe(a.cliente)}`} onClose={onClose} largura={480}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-mensalidade">Registrar {fmtMoney(a.plano.preco)}</Btn></>}>
      <div className="form-grade um">
        <Campo rotulo="Mês">
          <select value={mes} onChange={(e) => setMes(e.target.value)} data-testid="mensalidade-mes">
            {[-2, -1, 0, 1, 2, 3].map((n) => { const m = somaMeses(mesInicial, n); return m < a.inicioMes ? null : <option key={m} value={m}>{rotuloMes(m)}</option>; })}
          </select>
        </Campo>
        <Campo rotulo="Como foi pago">
          <select value={forma} onChange={(e) => setForma(e.target.value)} data-testid="mensalidade-forma">
            {Object.entries(FORMAS_PAGAMENTO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </Campo>
      </div>
      <p className="muted">O pagamento é direto com o profissional: aqui só fica registrado. Cada mensalidade paga libera {a.plano.cortes} atendimento{a.plano.cortes > 1 ? 's' : ''} no mês.</p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

export function FormEncerrar({ a, onClose, aoFeito }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const salvar = () => {
    const r = api.encerrar(a.id, motivo);
    if (!r.ok) { setErro(r.erros[0]); return; }
    const msg = r.divida > 0 ? `Plano encerrado. ${r.divida} atendimento(s) adiantado(s) ficaram como dívida.` : 'Plano encerrado.';
    toast(msg); if (aoFeito) aoFeito(msg);
    onClose();
  };
  return (
    <Modal titulo={`Encerrar plano · ${nomeDe(a.cliente)}`} onClose={onClose} largura={480}
      rodape={<><Btn onClick={onClose}>Voltar</Btn><Btn variante="perigo" onClick={salvar} data-testid="confirmar-encerrar">Encerrar plano</Btn></>}>
      <Campo rotulo="Motivo (5 a 200 letras)"><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} data-testid="encerrar-motivo" /></Campo>
      <p className="muted">Atendimentos que já foram agendados e passaram do que foi pago viram dívida e impedem um plano novo até serem quitados.</p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

function Extrato({ a, onClose, onChange }) {
  const [estornar, setEstornar] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const fazer = () => {
    const r = api.estornar(a.id, estornar, motivo);
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast('Mensalidade estornada.'); setEstornar(null); setMotivo(''); onChange(); onClose();
  };
  return (
    <Modal titulo={`Extrato · ${nomeDe(a.cliente)}`} onClose={onClose} largura={640} sub={`${a.plano.nome} · começou em ${rotuloMes(a.inicioMes)}`}
      rodape={<Btn onClick={onClose}>Fechar</Btn>}>
      <Tabela id="extrato-plano" testid="extrato-plano" minimo={false} chave={(l) => l.mes} linhas={a.extrato} colunas={[
        { id: 'mes', titulo: 'Mês', cel: (l) => rotuloMes(l.mes) },
        { id: 'pago', titulo: 'Pago', cel: (l) => (l.pago ? 'Sim' : 'Não') },
        { id: 'concedidos', titulo: 'Liberou', cls: 'num', cel: (l) => l.concedidos },
        { id: 'usados', titulo: 'Usou', cls: 'num', cel: (l) => l.usados },
        { id: 'saldo', titulo: 'Saldo', cls: 'num', cel: (l) => <>{l.saldoFim}{l.zerou ? <small className="muted"> (expirou)</small> : null}</> },
      ]} />
      <h4>Mensalidades</h4>
      <ul className="valores-lista" data-testid="mensalidades-lista">
        {(a.pagamentos || []).map((p) => (
          <li key={p.id} className="v-linha"><span>{rotuloMes(p.mes)} · {FORMAS_PAGAMENTO[p.forma]} · {fmtMoney(p.valor)}{p.estornado ? ' · estornada' : ''}</span>
            {!p.estornado && <Btn tamanho="sm" variante="perigo" onClick={() => { setEstornar(p.id); setErro(''); }} data-testid={`estornar-${p.id}`}>Estornar</Btn>}</li>
        ))}
        {!(a.pagamentos || []).length && <li className="muted">Nenhuma mensalidade registrada.</li>}
      </ul>
      {estornar && (
        <div className="subcartao">
          <Campo rotulo="Motivo do estorno (5 a 200 letras)"><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} data-testid="estorno-motivo" /></Campo>
          <div className="acoes"><Btn onClick={() => setEstornar(null)}>Cancelar</Btn><Btn variante="perigo" onClick={fazer} data-testid="confirmar-estorno">Estornar</Btn></div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
        </div>
      )}
      <h4>Histórico</h4>
      <ul className="log">{(a.log || []).slice(0, 12).map((x, i) => <li key={i}><span className="log-quando">{new Date(x.em).toLocaleString('pt-BR')}</span><span><b>{x.acao}</b> · {x.detalhe} <span className="muted">({x.autor?.nome})</span></span></li>)}</ul>
    </Modal>
  );
}

// ---------------------------------------------------------------- catálogo
function Catalogo({ dados, st, recarregar }) {
  const [edit, setEdit] = useState(null);
  const novo = () => setEdit({ nome: '', descricao: '', preco: '', cortes: 2, servicoIds: [], produtoIds: [], validadeMeses: 0, observacoes: '', adianta: 1, acumuloMeses: 2, intervaloDias: 3, ativo: true });
  const nomes = (p) => p.servicoIds.map((id) => st.servicos.find((s) => s.id === id)?.nome).filter(Boolean).join(', ');
  const modelos = modelosDePlanoDoTipo(tipoDe(st.estabelecimento)); // por tipo; sem modelo (estética), o botão nem aparece
  const [verModelos, setVerModelos] = useState(false);
  const usar = (m) => { const r = formularioDoModelo(m, st.servicos, st.materiais); setVerModelos(false); setEdit(r.form); if (r.faltou) toast(`Sua loja ainda não tem os serviços desse modelo: escolha os serviços do plano. Nada foi salvo.`); };
  return (
    <div className="painel" data-testid="aba-catalogo">
      <div className="tela-topo"><h3>Planos à venda</h3><div className="acoes">
        {modelos.length > 0 && <Btn icone="copy" onClick={() => setVerModelos(true)} data-testid="plano-usar-modelo">Usar modelo</Btn>}
        <Btn variante="primario" icone="plus" onClick={novo} data-testid="novo-plano">Novo plano</Btn>
      </div></div>
      {verModelos && (
        <Modal titulo="Modelos de plano" onClose={() => setVerModelos(false)} largura={640} sub="Escolha um para preencher o formulário. Nada é salvo até você salvar o plano."
          rodape={<Btn onClick={() => setVerModelos(false)}>Fechar</Btn>}>
          <ul className="avisos-lista" data-testid="modelos-lista">
            {modelos.map((m) => (
              <li key={m.chave} data-testid={`modelo-${m.chave}`}>
                <Icon n="ticket" size={16} />
                <span><b>{m.nome}</b> · {fmtMoney(m.preco)}/mês<br /><span className="muted">{m.cortes} atendimento{m.cortes > 1 ? 's' : ''} por mês. {m.descricao}</span></span>
                <div className="acoes"><Btn tamanho="sm" variante="primario" onClick={() => usar(m)} data-testid={`modelo-usar-${m.chave}`}>Usar</Btn></div>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {!dados.planos.length && <Vazio titulo="Nenhum plano" texto="Crie um plano mensal: nome, valor, quantos atendimentos por mês e quais serviços ele inclui." />}
      <div className="grade-cards" data-testid="planos-lista">
        {dados.planos.map((p) => (
          <article key={p.id} className={`card-serv ${p.ativo === false ? 'inativo' : ''}`} data-testid={`plano-${p.id}`}>
            <div className="card-serv-topo"><div><h3>{p.nome}</h3><span className="muted">{p.descricao}</span></div><b>{fmtMoney(p.preco)}<small className="muted">/mês</small></b></div>
            <ul className="meta">
              <li><Icon n="scissors" size={14} /> {p.cortes} atendimento{p.cortes > 1 ? 's' : ''} por mês: {nomes(p)}</li>
              {(p.produtoIds || []).length > 0 && <li><Icon n="ticket" size={14} /> Produto incluso em cada atendimento: {p.produtoIds.map((id) => st.materiais.find((x) => x.id === id)?.nome).filter(Boolean).join(', ')}</li>}
              {p.validadeMeses > 0 && <li><Icon n="calendar" size={14} /> Validade: {p.validadeMeses} mês(es) a partir do início</li>}
              <li><Icon n="clock" size={14} /> Pode adiantar {p.adianta} · acumula até {p.acumuloMeses} mês(es) · {p.intervaloDias} dia(s) entre atendimentos</li>
              {p.ativo === false && <li><Icon n="info" size={14} /> Fora de venda</li>}
            </ul>
            <div className="acoes">
              <Btn tamanho="sm" icone="edit" onClick={() => setEdit({ ...p })} data-testid={`plano-editar-${p.id}`}>Editar</Btn>
              <Btn tamanho="sm" variante="perigo" icone="trash" onClick={() => { const r = api.remover(p.id); if (r.ok) { toast(r.desativado ? 'Plano com assinaturas: saiu de venda, mas ficou no histórico.' : 'Plano removido.'); recarregar(); } else toast(r.erros[0], 'erro'); }} data-testid={`plano-remover-${p.id}`}>Remover</Btn>
            </div>
          </article>
        ))}
      </div>
      {edit && <FormPlano p={edit} st={st} onClose={() => { setEdit(null); recarregar(); }} />}
    </div>
  );
}

function FormPlano({ p, st, onClose }) {
  const [f, setF] = useState(p);
  const [erro, setErro] = useState('');
  const salvar = () => {
    const r = api.salvar({ ...f, preco: f.preco === '' ? undefined : Number(f.preco) });
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast(f.id ? 'Plano salvo. Quem já assinou continua com as condições de quando contratou.' : 'Plano criado.');
    onClose();
  };
  const alterna = (id, on) => setF({ ...f, servicoIds: on ? [...f.servicoIds, id] : f.servicoIds.filter((x) => x !== id) });
  const servicos = st.servicos.filter((s) => s.ativo !== false && !s.combo);
  const produtos = st.materiais.filter((m) => m.tipo === 'produto' && m.ativo !== false);
  const alternaProd = (id, on) => setF({ ...f, produtoIds: on ? [...(f.produtoIds || []), id] : (f.produtoIds || []).filter((x) => x !== id) });
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  return (
    <Modal titulo={f.id ? 'Editar plano' : 'Novo plano'} onClose={onClose} largura={640}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-plano">Salvar</Btn></>}>
      <div className="form-grade">
        <Campo rotulo="Nome do plano" className="campo-largo"><input value={f.nome} maxLength={60} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="plano-nome" /></Campo>
        <Campo rotulo="Descrição (aparece no link de planos)" className="campo-largo"><input value={f.descricao || ''} maxLength={200} onChange={(e) => setF({ ...f, descricao: e.target.value })} data-testid="plano-descricao" /></Campo>
        <Campo rotulo="Valor por mês (R$)"><input type="number" min="1" step="0.5" value={f.preco} onChange={num('preco')} data-testid="plano-preco" /></Campo>
        <Campo rotulo={`Atendimentos por mês (1 a ${CORTES_MAX})`}><input type="number" min="1" max={CORTES_MAX} value={f.cortes} onChange={num('cortes')} data-testid="plano-cortes" /></Campo>
        <Campo rotulo="Observações internas (opcional)" className="campo-largo"><input value={f.observacoes || ''} maxLength={300} onChange={(e) => setF({ ...f, observacoes: e.target.value })} data-testid="plano-observacoes" /></Campo>
        <fieldset className="campo-largo conj"><legend>Serviços que o plano inclui (saem de graça no atendimento)</legend>
          <div className="servicos-lista">{servicos.map((s) => (
            <label key={s.id} className={`servico-op ${f.servicoIds.includes(s.id) ? 'on' : ''}`}><input type="checkbox" checked={f.servicoIds.includes(s.id)} onChange={(e) => alterna(s.id, e.target.checked)} data-testid={`plano-srv-${s.id}`} /><span><b>{s.nome}</b></span></label>
          ))}</div>
        </fieldset>
        {produtos.length > 0 && (
          <fieldset className="campo-largo conj"><legend>Produtos incluídos (1 unidade de graça em cada atendimento do plano)</legend>
            <div className="servicos-lista">{produtos.map((m) => (
              <label key={m.id} className={`servico-op ${(f.produtoIds || []).includes(m.id) ? 'on' : ''}`}><input type="checkbox" checked={(f.produtoIds || []).includes(m.id)} onChange={(e) => alternaProd(m.id, e.target.checked)} data-testid={`plano-prod-${m.id}`} /><span><b>{m.nome}</b></span></label>
            ))}</div>
          </fieldset>
        )}
        <Campo rotulo={`Validade em meses (0 = sem prazo, até ${VALIDADE_MAX})`} dica="Depois do último mês o plano deixa de valer para novos atendimentos."><input type="number" min="0" max={VALIDADE_MAX} value={f.validadeMeses ?? 0} onChange={num('validadeMeses')} data-testid="plano-validade" /></Campo>
        <Campo rotulo={`Pode passar do saldo em (0 a ${ADIANTA_MAX})`} dica="Adianta atendimentos do mês seguinte; o aviso aparece depois de salvar."><input type="number" min="0" max={ADIANTA_MAX} value={f.adianta} onChange={num('adianta')} data-testid="plano-adianta" /></Campo>
        <Campo rotulo={`Meses que o saldo acumula (1 a ${ACUMULO_MAX})`}><input type="number" min="1" max={ACUMULO_MAX} value={f.acumuloMeses} onChange={num('acumuloMeses')} data-testid="plano-acumulo" /></Campo>
        <Campo rotulo={`Dias entre atendimentos (0 a ${INTERVALO_MAX})`}><input type="number" min="0" max={INTERVALO_MAX} value={f.intervaloDias} onChange={num('intervaloDias')} data-testid="plano-intervalo" /></Campo>
        <label className="interruptor campo-largo"><input type="checkbox" checked={f.ativo !== false} onChange={(e) => setF({ ...f, ativo: e.target.checked })} data-testid="plano-ativo" /><span className="trilho"><i className="bolinha" /></span><span className="interruptor-txt"><b>À venda</b><small className="muted">Desligado: some do link de planos e não aceita assinatura nova.</small></span></label>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

// ---------------------------------------------------------------- pedidos pelo link
function Pedidos({ dados, recarregar }) {
  const agir = (fn, id, ok) => { const r = fn(id); if (r.ok) { toast(ok); recarregar(); } else toast(r.erros[0], 'erro'); };
  return (
    <div className="painel" data-testid="aba-pedidos">
      <h3>Pedidos pelo link de planos</h3>
      {!dados.pedidos.length && <Vazio titulo="Nenhum pedido" texto="Quando um cliente escolher um plano no seu link, o pedido aparece aqui para você aceitar ou recusar." />}
      <ul className="avisos-lista">
        {dados.pedidos.map((p) => (
          <li key={p.id} data-testid={`pedido-${p.id}`}>
            <Icon n="ticket" size={16} />
            <span><b>{p.nome}</b> quer o plano <b>{p.planoNome}</b><br /><span className="muted">{p.telefone.replace(/^55/, '')}</span></span>
            <div className="acoes">
              <Btn tamanho="sm" variante="primario" onClick={() => agir(api.aceitarPedido, p.id, 'Pedido aceito: assinatura criada, aguardando a mensalidade.')} data-testid={`pedido-aceitar-${p.id}`}>Aceitar</Btn>
              <Btn tamanho="sm" onClick={() => agir(api.recusarPedido, p.id, 'Pedido recusado.')} data-testid={`pedido-recusar-${p.id}`}>Recusar</Btn>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
