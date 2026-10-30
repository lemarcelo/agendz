/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço do site real (V32), de quem tem a seção Planos: assinaturas (mensalidade, saldo de cortes, extrato, encerrar, quitar), catálogo de planos e pedidos que
// chegam pelo link. O pagamento é direto com o profissional: aqui só se registra. O saldo vem do servidor (derivado dos atendimentos), nunca é digitado nem calculado aqui.
// Toda regra (um plano por cliente, cota, adiantamento, estorno sem deixar horário descoberto, dívida) é do servidor; a tela mostra a mensagem dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS próprias terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { planos as api, clientes as apiClientes, servicos as apiServicos } from '../../services/api-real.js';
import { ADIANTA_MAX, ACUMULO_MAX, INTERVALO_MAX, CORTES_MAX, SITUACAO, rotuloMes, somaMeses } from '../../domain/planos.js';
import { fmtMoney } from '../../domain/time.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const FORMAS = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' };
const nomeDe = (c) => (c && c.nome ? (c.apelido && c.apelido !== c.nome ? `${c.nome} (${c.apelido})` : c.nome) : '—');
const plural = (n, um, varios) => (n === 1 ? um : varios);

function situacaoDe(a) {
  if (a.status === 'cancelada') return a.divida > 0 && !a.dividaQuitada ? 'Encerrado com dívida' : SITUACAO.cancelada;
  if (a.status === 'pendente') return SITUACAO.pendente;
  return a.saldo.atrasado ? 'Mensalidade atrasada' : SITUACAO.ativa;
}

// ---------------------------------------------------------------- formulários (cada um ocupa a tela, como o de cupons)
export function Rodape({ erro, enviando, aoCancelar, rotuloSalvar, rotuloCancelar = 'Cancelar', perigo, testid }) {
  return (
    <>
      {erro && <Aviso tipo="erro" data-testid="planos-erro-form">{erro}</Aviso>}
      <div className="acoes">
        <Btn onClick={aoCancelar} data-testid="planos-voltar">{rotuloCancelar}</Btn>
        <Btn variante={perigo ? 'perigo' : 'primario'} type="submit" disabled={enviando} data-testid={testid}>{enviando ? 'Salvando…' : rotuloSalvar}</Btn>
      </div>
    </>
  );
}

export function usarEnvio(fazer, aoOk) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await fazer();
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoOk(r);
  };
  return { erro, enviando, enviar };
}

function FormAssinatura({ planos, mes, aoCancelar, aoFeito }) {
  const ativos = planos.filter((p) => p.ativo);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [planoId, setPlanoId] = useState(ativos[0] ? ativos[0].id : '');
  const [inicioMes, setInicioMes] = useState(mes);
  const [dia, setDia] = useState('5');
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await apiClientes.listar(busca);
      if (vivo && r.ok) setAchados(r.clientes.slice(0, 8));
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca]);
  const { erro, enviando, enviar } = usarEnvio(() => (cliente ? api.contratar({ clienteId: cliente.id, planoId, inicioMes, diaCobranca: dia }) : Promise.resolve({ ok: false, erro: 'Escolha o cliente.' })),
    () => aoFeito('Assinatura criada. Registre a mensalidade quando receber.'));
  return (
    <section className="tela" data-testid="assinatura-form">
      <header className="tela-topo"><h1>Nova assinatura</h1></header>
      <form onSubmit={enviar} className="form-grade um">
        <fieldset className="conj">
          <legend>Cliente</legend>
          {cliente ? (
            <div className="acoes"><b data-testid="assinatura-cliente-escolhido">{nomeDe(cliente)}</b><Btn tamanho="sm" onClick={() => setCliente(null)} data-testid="assinatura-trocar-cliente">Trocar</Btn></div>
          ) : (
            <>
              <Campo rotulo="Buscar por nome, telefone ou placa"><input value={busca} maxLength={60} onChange={(e) => setBusca(e.target.value)} data-testid="assinatura-busca" /></Campo>
              <ul className="clientes-lista">
                {achados.map((c) => <li key={c.id}><button type="button" className="btn btn-neutro planos-escolha-real" onClick={() => setCliente(c)} data-testid={`assinatura-cliente-${c.id}`}>{nomeDe(c)} <small className="muted">{c.telefone}</small></button></li>)}
                {achados.length === 0 && <li className="muted">Nenhum cliente encontrado.</li>}
              </ul>
            </>
          )}
        </fieldset>
        <Campo rotulo="Plano">
          <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} data-testid="assinatura-plano">
            {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome} · {fmtMoney(p.preco)}/mês · {p.cortes} {plural(p.cortes, 'corte', 'cortes')}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Começa em">
          <select value={inicioMes} onChange={(e) => setInicioMes(e.target.value)} data-testid="assinatura-inicio">
            {[-2, -1, 0, 1, 2, 3].map((n) => { const m = somaMeses(mes, n); return <option key={m} value={m}>{rotuloMes(m)}</option>; })}
          </select>
        </Campo>
        <Campo rotulo="Dia de cobrança (1 a 28)"><input inputMode="numeric" value={dia} maxLength={2} onChange={(e) => setDia(e.target.value)} data-testid="assinatura-dia" /></Campo>
        <Rodape erro={erro} enviando={enviando} aoCancelar={aoCancelar} rotuloSalvar="Criar" testid="salvar-assinatura" />
      </form>
    </section>
  );
}

export function FormMensalidade({ a, mesInicial, aoCancelar, aoFeito }) {
  const [mes, setMes] = useState(mesInicial);
  const [forma, setForma] = useState('pix');
  const { erro, enviando, enviar } = usarEnvio(() => api.pagar(a.id, { mes, forma }), () => aoFeito(`Mensalidade de ${rotuloMes(mes)} registrada.`));
  return (
    <section className="tela" data-testid="mensalidade-form">
      <header className="tela-topo"><h1>Mensalidade · {nomeDe(a.cliente)}</h1></header>
      <form onSubmit={enviar} className="form-grade um">
        <Campo rotulo="Mês">
          <select value={mes} onChange={(e) => setMes(e.target.value)} data-testid="mensalidade-mes">
            {[-2, -1, 0, 1, 2, 3].map((n) => { const m = somaMeses(mesInicial, n); return m < a.inicioMes ? null : <option key={m} value={m}>{rotuloMes(m)}</option>; })}
          </select>
        </Campo>
        <Campo rotulo="Como foi pago">
          <select value={forma} onChange={(e) => setForma(e.target.value)} data-testid="mensalidade-forma">
            {Object.entries(FORMAS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </Campo>
        <p className="muted">O pagamento é direto com o profissional: aqui só fica registrado. Cada mensalidade paga libera {a.plano.cortes} {plural(a.plano.cortes, 'corte', 'cortes')} no mês.</p>
        <Rodape erro={erro} enviando={enviando} aoCancelar={aoCancelar} rotuloSalvar={`Registrar ${fmtMoney(a.plano.preco)}`} testid="salvar-mensalidade" />
      </form>
    </section>
  );
}

export function FormEncerrar({ a, aoCancelar, aoFeito }) {
  const [motivo, setMotivo] = useState('');
  const { erro, enviando, enviar } = usarEnvio(() => api.encerrar(a.id, motivo),
    (r) => aoFeito(r.divida > 0 ? `Plano encerrado. ${r.divida} ${plural(r.divida, 'corte adiantado ficou', 'cortes adiantados ficaram')} como dívida.` : 'Plano encerrado.'));
  return (
    <section className="tela" data-testid="encerrar-form">
      <header className="tela-topo"><h1>Encerrar plano · {nomeDe(a.cliente)}</h1></header>
      <form onSubmit={enviar} className="form-grade um">
        <Campo rotulo="Motivo (5 a 200 letras)"><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} data-testid="encerrar-motivo" /></Campo>
        <p className="muted">Cortes que já foram agendados e passaram do que foi pago viram dívida e impedem um plano novo até serem quitados.</p>
        <Rodape erro={erro} enviando={enviando} aoCancelar={aoCancelar} rotuloCancelar="Voltar" rotuloSalvar="Encerrar plano" perigo testid="confirmar-encerrar" />
      </form>
    </section>
  );
}

function Extrato({ a, aoFechar, aoFeito }) {
  const [estornar, setEstornar] = useState('');
  const [motivo, setMotivo] = useState('');
  const { erro, enviando, enviar } = usarEnvio(() => api.estornar(a.id, estornar, motivo), () => aoFeito('Mensalidade estornada.'));
  return (
    <section className="tela" data-testid="extrato-plano">
      <header className="tela-topo"><h1>Extrato · {nomeDe(a.cliente)}</h1><Btn onClick={aoFechar} data-testid="extrato-fechar">Fechar</Btn></header>
      <p className="muted">{a.plano.nome} · começou em {rotuloMes(a.inicioMes)}</p>
      <ul className="valores-lista" data-testid="extrato-linhas">
        {a.extrato.length === 0 && <li className="muted">O extrato começa na primeira mensalidade registrada.</li>}
        {a.extrato.map((l) => (
          <li key={l.mes} className="v-linha" data-testid={`extrato-${l.mes}`}>
            <span>{rotuloMes(l.mes)} · {l.pago ? 'pago' : 'não pago'}</span>
            <span>liberou {l.concedidos} · usou {l.usados} · saldo <b>{l.saldoFim}</b>{l.zerou ? ' (expirou)' : ''}</span>
          </li>
        ))}
      </ul>
      <h2>Mensalidades</h2>
      <ul className="valores-lista" data-testid="mensalidades-lista">
        {a.pagamentos.map((p) => (
          <li key={p.id} className="v-linha">
            <span>{rotuloMes(p.mes)} · {FORMAS[p.forma]} · {fmtMoney(p.valor)}{p.estornado ? ' · estornada' : ''}</span>
            {!p.estornado && a.status !== 'cancelada' && <Btn tamanho="sm" variante="perigo" onClick={() => setEstornar(p.id)} data-testid={`estornar-${p.id}`}>Estornar</Btn>}
          </li>
        ))}
        {a.pagamentos.length === 0 && <li className="muted">Nenhuma mensalidade registrada.</li>}
      </ul>
      {estornar && (
        <form onSubmit={enviar} className="subcartao" data-testid="estorno-form">
          <Campo rotulo="Motivo do estorno (5 a 200 letras)"><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} data-testid="estorno-motivo" /></Campo>
          <Rodape erro={erro} enviando={enviando} aoCancelar={() => { setEstornar(''); setMotivo(''); }} rotuloSalvar="Estornar" perigo testid="confirmar-estorno" />
        </form>
      )}
      <h2>Histórico</h2>
      <ul className="log">{a.log.slice(0, 12).map((x, i) => <li key={i}><span className="log-quando">{x.em ? new Date(x.em).toLocaleString('pt-BR') : ''}</span><span><b>{x.acao}</b> · {x.detalhe} <span className="muted">({x.autor.nome})</span></span></li>)}</ul>
    </section>
  );
}

function FormPlano({ p, servicos, aoCancelar, aoFeito }) {
  const [f, setF] = useState(() => ({ id: p.id || '', nome: p.nome || '', descricao: p.descricao || '', preco: p.preco ? String(p.preco) : '', cortes: String(p.cortes || 2), servicoIds: p.servicoIds || [],
    adianta: String(p.adianta ?? 1), acumuloMeses: String(p.acumuloMeses || 2), intervaloDias: String(p.intervaloDias ?? 3), ativo: p.ativo !== false }));
  const { erro, enviando, enviar } = usarEnvio(() => api.salvar(f), () => aoFeito(f.id ? 'Plano salvo. Quem já assinou continua com as condições de quando contratou.' : 'Plano criado.'));
  const mudar = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const alternar = (id) => setF({ ...f, servicoIds: f.servicoIds.includes(id) ? f.servicoIds.filter((x) => x !== id) : [...f.servicoIds, id] });
  const lista = servicos.filter((s) => (s.ativo !== false && !s.combo) || f.servicoIds.includes(s.id));
  return (
    <section className="tela" data-testid="plano-form">
      <header className="tela-topo"><h1>{f.id ? 'Editar plano' : 'Novo plano'}</h1></header>
      <form onSubmit={enviar} className="form-grade">
        <Campo rotulo="Nome do plano"><input value={f.nome} maxLength={60} onChange={mudar('nome')} data-testid="plano-nome" /></Campo>
        <Campo rotulo="Descrição (opcional)"><input value={f.descricao} maxLength={200} onChange={mudar('descricao')} data-testid="plano-descricao" /></Campo>
        <Campo rotulo="Valor por mês (R$)"><input inputMode="decimal" value={f.preco} onChange={mudar('preco')} data-testid="plano-preco" /></Campo>
        <Campo rotulo={`Atendimentos por mês (1 a ${CORTES_MAX})`}><input inputMode="numeric" value={f.cortes} onChange={mudar('cortes')} data-testid="plano-cortes" /></Campo>
        <fieldset className="atender-real-bloco">
          <legend>Serviços que o plano inclui (saem de graça no atendimento)</legend>
          {lista.length === 0 && <p className="muted">Cadastre serviços antes.</p>}
          {lista.map((s) => <label key={s.id} className="check-linha"><input type="checkbox" checked={f.servicoIds.includes(s.id)} onChange={() => alternar(s.id)} data-testid={`plano-srv-${s.id}`} /><span>{s.nome}</span></label>)}
        </fieldset>
        <Campo rotulo={`Pode passar do saldo em (0 a ${ADIANTA_MAX})`} dica="Adianta atendimentos do mês seguinte."><input inputMode="numeric" value={f.adianta} onChange={mudar('adianta')} data-testid="plano-adianta" /></Campo>
        <Campo rotulo={`Meses que o saldo acumula (1 a ${ACUMULO_MAX})`}><input inputMode="numeric" value={f.acumuloMeses} onChange={mudar('acumuloMeses')} data-testid="plano-acumulo" /></Campo>
        <Campo rotulo={`Dias entre atendimentos (0 a ${INTERVALO_MAX})`}><input inputMode="numeric" value={f.intervaloDias} onChange={mudar('intervaloDias')} data-testid="plano-intervalo" /></Campo>
        <label className="check-linha"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} data-testid="plano-ativo" /><span>À venda (desligado: não aceita assinatura nova)</span></label>
        <div className="planos-rodape-real"><Rodape erro={erro} enviando={enviando} aoCancelar={aoCancelar} rotuloSalvar="Salvar" testid="salvar-plano" /></div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- abas
function Assinaturas({ dados, aoAbrir, aoQuitar }) {
  const aReceber = dados.assinaturas.filter((a) => dados.aReceber.includes(a.id));
  const semPlano = !dados.planos.some((p) => p.ativo);
  return (
    <div data-testid="aba-assinaturas">
      <div className="acoes"><Btn variante="primario" onClick={() => aoAbrir({ tipo: 'assinar' })} disabled={semPlano} data-testid="nova-assinatura"><Icone n="plus" size={16} /> Nova assinatura</Btn></div>
      {semPlano && <Aviso>Crie primeiro um plano na aba “Planos”.</Aviso>}
      {aReceber.length > 0 && (
        <div className="subcartao" data-testid="a-receber">
          <b>A receber em {rotuloMes(dados.mes)}</b>
          {aReceber.map((a) => (
            <div key={a.id} className="acoes" data-testid={`a-receber-${a.id}`}>
              <span>{nomeDe(a.cliente)} · {a.plano.nome} · <b>{fmtMoney(a.plano.preco)}</b></span>
              <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'pagar', a, mes: dados.mes })} data-testid={`receber-${a.id}`}>Registrar mensalidade</Btn>
            </div>
          ))}
        </div>
      )}
      {dados.assinaturas.length === 0 ? <p className="muted" data-testid="assinaturas-vazio">Nenhuma assinatura. Escolha um cliente e um plano para começar a cobrar por mês.</p> : (
        <ul className="clientes-lista" data-testid="assinaturas-lista">
          {dados.assinaturas.map((a) => (
            <li key={a.id} className="cliente-cartao" data-testid={`assinatura-${a.id}`}>
              <div className="cliente-dados">
                <b>{nomeDe(a.cliente)}</b> <span className={`chip ${a.status === 'ativa' && !a.saldo.atrasado ? 'chip-ok' : 'chip-p'}`} data-testid={`situacao-${a.id}`}>{situacaoDe(a)}</span>
                <span className="cliente-linha">{a.plano.nome} · {fmtMoney(a.plano.preco)}/mês</span>
                {a.status === 'ativa' && <span className="cliente-linha" data-testid={`saldo-${a.id}`}>Cortes que restam: <b>{a.saldo.restantes}</b> de {a.plano.cortes}{a.saldo.maisPermitidos > 0 ? ` (+${a.saldo.maisPermitidos} adiantável)` : ''}</span>}
                <span className="cliente-linha muted">Pago até: {a.saldo.pagoAte ? rotuloMes(a.saldo.pagoAte) : '—'}</span>
              </div>
              <div className="acoes">
                {a.status !== 'cancelada' && <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'pagar', a, mes: dados.mes })} data-testid={`pagar-${a.id}`}>Mensalidade</Btn>}
                <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'extrato', a })} data-testid={`extrato-${a.id}`}>Extrato</Btn>
                {a.status !== 'cancelada' && <Btn tamanho="sm" variante="perigo" onClick={() => aoAbrir({ tipo: 'encerrar', a })} data-testid={`encerrar-${a.id}`}>Encerrar</Btn>}
                {a.status === 'cancelada' && a.divida > 0 && !a.dividaQuitada && <Btn tamanho="sm" onClick={() => aoQuitar(a)} data-testid={`quitar-${a.id}`}>Quitar dívida</Btn>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Catalogo({ dados, servicos, aoAbrir, aoRemover }) {
  const nomes = (p) => p.servicoIds.map((id) => (servicos.find((s) => s.id === id) || {}).nome).filter(Boolean).join(', ');
  return (
    <div data-testid="aba-catalogo">
      <div className="acoes"><Btn variante="primario" onClick={() => aoAbrir({ tipo: 'plano', p: {} })} data-testid="novo-plano"><Icone n="plus" size={16} /> Novo plano</Btn></div>
      {dados.planos.length === 0 ? <p className="muted" data-testid="planos-vazio">Nenhum plano. Crie um plano mensal: nome, valor, quantos atendimentos por mês e quais serviços ele inclui.</p> : (
        <ul className="clientes-lista" data-testid="planos-lista">
          {dados.planos.map((p) => (
            <li key={p.id} className="cliente-cartao" data-testid={`plano-${p.id}`}>
              <div className="cliente-dados">
                <b>{p.nome}</b> <span className={`chip ${p.ativo ? 'chip-ok' : 'chip-p'}`}>{p.ativo ? 'À venda' : 'Fora de venda'}</span>
                {p.descricao && <span className="cliente-linha muted">{p.descricao}</span>}
                <span className="cliente-linha"><b>{fmtMoney(p.preco)}</b>/mês · {p.cortes} {plural(p.cortes, 'atendimento', 'atendimentos')} por mês: {nomes(p)}</span>
                <span className="cliente-linha muted">Pode adiantar {p.adianta} · acumula até {p.acumuloMeses} {plural(p.acumuloMeses, 'mês', 'meses')} · {p.intervaloDias} {plural(p.intervaloDias, 'dia', 'dias')} entre atendimentos</span>
              </div>
              <div className="acoes">
                <Btn tamanho="sm" onClick={() => aoAbrir({ tipo: 'plano', p })} data-testid={`plano-editar-${p.id}`}><Icone n="edit" size={15} /> Editar</Btn>
                <Btn tamanho="sm" onClick={() => aoRemover(p)} aria-label={`Remover ${p.nome}`} data-testid={`plano-remover-${p.id}`}><Icone n="trash" size={15} /></Btn>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pedidos({ dados, aoAgir }) {
  return (
    <div data-testid="aba-pedidos">
      {dados.pedidos.length === 0 ? <p className="muted" data-testid="pedidos-vazio">Nenhum pedido. Quando um cliente escolher um plano no seu link, o pedido aparece aqui para você aceitar ou recusar.</p> : (
        <ul className="clientes-lista">
          {dados.pedidos.map((p) => (
            <li key={p.id} className="cliente-cartao" data-testid={`pedido-${p.id}`}>
              <div className="cliente-dados"><b>{p.nome}</b> quer o plano <b>{p.planoNome}</b><span className="cliente-linha muted">{p.telefone.replace(/^55/, '')}</span></div>
              <div className="acoes">
                <Btn tamanho="sm" variante="primario" onClick={() => aoAgir(() => api.aceitarPedido(p.id), 'Pedido aceito: assinatura criada, aguardando a mensalidade.')} data-testid={`pedido-aceitar-${p.id}`}>Aceitar</Btn>
                <Btn tamanho="sm" onClick={() => aoAgir(() => api.recusarPedido(p.id), 'Pedido recusado.')} data-testid={`pedido-recusar-${p.id}`}>Recusar</Btn>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Planos() {
  const [dados, setDados] = useState(null); // null = carregando
  const [servicos, setServicos] = useState([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [aba, setAba] = useState('assinaturas');
  const [modo, setModo] = useState(null); // { tipo: 'assinar' | 'pagar' | 'encerrar' | 'extrato' | 'plano', ... }
  const [confirmar, setConfirmar] = useState(null); // plano a remover
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [a, b] = await Promise.all([api.listar(), apiServicos.listar()]);
      if (!vivo) return;
      if (!a.ok) { setErro(a.erro); setDados((d) => d || { planos: [], assinaturas: [], pedidos: [], aReceber: [], mes: '' }); return; }
      setErro(''); setDados(a); setServicos(b.ok ? b.servicos : []);
    })();
    return () => { vivo = false; };
  }, [versao]);

  const recarregar = () => setVersao((v) => v + 1);
  const feito = (msg) => { setModo(null); setAviso(msg); setErro(''); recarregar(); };
  const agir = async (fazer, ok) => {
    setErro(''); setAviso('');
    const r = await fazer();
    if (!r.ok) { setErro(r.erro); return; }
    setAviso(typeof ok === 'function' ? ok(r) : ok); recarregar();
  };
  const remover = async (p) => { setConfirmar(null); await agir(() => api.remover(p.id), (r) => (r.desativado ? 'Plano com assinaturas: saiu de venda, mas ficou no histórico.' : 'Plano removido.')); };

  if (dados === null) return <section className="tela" data-testid="tela-planos"><p className="muted" role="status" data-testid="planos-carregando">Carregando…</p></section>;
  if (modo && modo.tipo === 'assinar') return <FormAssinatura planos={dados.planos} mes={dados.mes} aoCancelar={() => setModo(null)} aoFeito={feito} />;
  if (modo && modo.tipo === 'pagar') return <FormMensalidade a={modo.a} mesInicial={modo.mes} aoCancelar={() => setModo(null)} aoFeito={feito} />;
  if (modo && modo.tipo === 'encerrar') return <FormEncerrar a={modo.a} aoCancelar={() => setModo(null)} aoFeito={feito} />;
  if (modo && modo.tipo === 'extrato') {
    const atual = dados.assinaturas.find((x) => x.id === modo.a.id) || modo.a;
    return <Extrato a={atual} aoFechar={() => setModo(null)} aoFeito={(m) => { setAviso(m); recarregar(); }} />;
  }
  if (modo && modo.tipo === 'plano') return <FormPlano p={modo.p} servicos={servicos} aoCancelar={() => setModo(null)} aoFeito={feito} />;
  const novos = dados.pedidos.length;
  return (
    <section className="tela" data-testid="tela-planos">
      <header className="tela-topo"><h1>Planos</h1></header>
      <p className="muted">Planos mensais: o cliente paga direto com você, você registra a mensalidade aqui e os atendimentos do mês ficam liberados.</p>
      {aviso && <Aviso data-testid="planos-aviso"><span role="status">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro" data-testid="planos-erro">{erro}</Aviso>}
      {confirmar && (
        <div className="acoes" data-testid="plano-confirmar">
          <span>Remover “{confirmar.nome}”? Se já tem assinatura, ele só sai de venda.</span>
          <Btn tamanho="sm" variante="perigo" onClick={() => remover(confirmar)} data-testid="plano-confirmar-sim">Remover</Btn>
          <Btn tamanho="sm" onClick={() => setConfirmar(null)} data-testid="plano-confirmar-nao">Voltar</Btn>
        </div>
      )}
      <div className="abas" role="tablist" aria-label="Planos">
        {[['assinaturas', 'Assinaturas'], ['catalogo', 'Planos'], ['pedidos', `Pedidos do link${novos ? ` (${novos})` : ''}`]].map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)} data-testid={`planos-aba-${k}`}>{r}</button>
        ))}
      </div>
      {aba === 'assinaturas' && <Assinaturas dados={dados} aoAbrir={(m) => { setAviso(''); setModo(m); }} aoQuitar={(a) => agir(() => api.quitar(a.id), 'Dívida quitada.')} />}
      {aba === 'catalogo' && <Catalogo dados={dados} servicos={servicos} aoAbrir={(m) => { setAviso(''); setModo(m); }} aoRemover={setConfirmar} />}
      {aba === 'pedidos' && <Pedidos dados={dados} aoAgir={agir} />}
    </section>
  );
}
