/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda do site real (F2 parte 5b): Horários (cartões do dia + próximos agendamentos por dia) e Calendário (mês), troca de profissional, status e remarcar.
// Toda a regra (conflito, expediente, reativar, confirmar cancela "a confirmar" que cobrem, concluído nunca remarca) está no servidor: a tela mostra o que ele
// devolve, com as mensagens dele. O profissional só recebe os próprios agendamentos (o servidor filtra). Atender (atendimento local e novo agendamento) é o `Atender.jsx` (5c);
// nas lojas com veículo/porte e box (estética) o Atender pede o veículo e deixa escolher o box; o cartão e a ficha mostram veículo, porte e box.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agenda as api, boxes as apiBoxes, clientes as apiClientes, linkAgendamento as apiLink, local as apiLocal, profissionais as apiProf } from '../../services/api-real.js';
import { DIAS_CURTOS, addDays, addMonths, fmtDateTime, fmtDayLong, maiuscula1, fmtDiaMesSemana, fmtHM, fmtMoney, fmtMonthYear, monthStart, sameDay, startOfDay, weekStart, ymd } from '../../domain/time.js';
import { ATIVOS, ROTULO_STATUS } from '../../domain/rules.js';
import { agruparPorDia, rotuloCancelados, rotuloDoGrupo, separarCancelados } from '../../domain/agenda-grupos.js';
import { abreviarNome } from '../../domain/abreviar.js';
import { Rot, capAtiva } from '../../domain/tipos.js';
import { ROTULO_PORTE, rotuloVeiculo } from '../../domain/veiculos.js';
import { boxesAtivos } from '../../domain/atender-form.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import FormaPagamento from '../leve/FormaPagamento.jsx';
import { useToqueLongo } from '../leve/segurar.js';
import { montarLinkAgendamento } from '../../domain/link-publico.js';
import { numeroWhatsapp, textoConvite, textoReagendamento } from '../../domain/whatsapp.js';
import { abrirWhatsapp } from '../whatsapp.js';
import Atender from './Atender.jsx';
import { useAtualizacaoAutomatica } from './atualizar.js';

const CHAVE_COR = { a_confirmar: 'amarelo', confirmado: 'azul', concluido: 'verde', cancelado: 'cinza' };
// "Cliente agendou": pediu pelo link e aguarda o estabelecimento confirmar (só visual, sobre "a confirmar").
const visual = (a) => (a.status === 'a_confirmar' && a.origem === 'link' ? { cor: 'roxo', rotulo: 'Cliente agendou' } : { cor: CHAVE_COR[a.status], rotulo: ROTULO_STATUS[a.status] });
const aoLocal = (ts) => { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const doLocal = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };


function Cartao({ a, nomeCliente, nomeProf, mostraProf, aberto, aoAbrir, aoSegurar, testid, destaque = false, children }) {
  const v = visual(a);
  const toque = useToqueLongo(() => { if (aoSegurar) aoSegurar(a); }); // v119: segurar abre a forma de pagamento (concluído ou futuro; cancelado não)
  const venda = a.produtos.length ? a.produtos.map((p) => `${p.qtd}× ${p.nome}`).join(', ') : '';
  const servicos = a.servicos.map((s) => s.nome).join(' + ') || (venda ? 'Venda de produtos' : 'Sem serviço');
  return (
    <div className={`cartao-real st-${v.cor}${destaque ? ' cartao-novo-real' : ''}`} data-testid={testid} data-status={a.status} data-id={a.id} data-destaque={destaque ? 'sim' : undefined}>
      <button type="button" className="cartao" onClick={aoAbrir} aria-expanded={aberto} data-testid={`${testid}-abrir`} {...(aoSegurar && a.status !== 'cancelado' ? toque : {})}>
        <div className="cartao-topo">
          <div className="cartao-quem">
            <span className="cartao-nome" title={nomeCliente} data-testid={`${testid}-cliente`}>{abreviarNome(nomeCliente, 24)}</span>
            <span className={`chip chip-p st-${v.cor}`} data-testid={`${testid}-status`}>{v.rotulo}</span>
          </div>
          <div className={`cartao-quando ${testid === 'cartao' ? 'quando-hoje' : 'quando-proximo'}`}><b className="cartao-data" data-testid="cartao-data">{fmtDiaMesSemana(a.inicio)}</b><strong className="cartao-hora">{fmtHM(a.inicio)}</strong></div>
        </div>
        <div className="cartao-servico" title={servicos} data-testid={`${testid}-servico`}>{servicos}</div>
        <div className="cartao-profissional">
          {mostraProf && <span className="cartao-prof" title={nomeProf} data-testid={`${testid}-profissional`}>com <b>{abreviarNome(nomeProf)}</b></span>}
          <span className="cartao-valor" data-testid={`${testid}-valor`}>{fmtMoney(a.total - a.desconto + a.totalProdutos)}</span>
        </div>
        {a.estetica && (a.estetica.placa || a.estetica.box) && (
          <div className="cartao-veiculo-real muted" data-testid={`${testid}-veiculo`}>{[a.estetica.placa ? [[a.estetica.marca, a.estetica.modelo].filter(Boolean).join(' '), a.estetica.placa].filter(Boolean).join(' · ') : '', a.estetica.box].filter(Boolean).join(' · ')}</div>
        )}
        <div className="cartao-rodape">
          {a.encaixe && <span className="chip chip-p chip-encaixe">Encaixe</span>}
          {a.reagendado && <span className="chip chip-p chip-reag">Reagendado</span>}
          {a.conflitosPendentes.length > 0 && <span className="chip chip-p chip-alerta" data-testid="cartao-conflito">{a.conflitosPendentes.length === 1 ? '1 a confirmar no mesmo horário' : `${a.conflitosPendentes.length} a confirmar no mesmo horário`}</span>}
        </div>
      </button>
      {aberto && children}
    </div>
  );
}

// Detalhes e ações de um agendamento aberto: status, cancelar com confirmação na tela, remarcar e histórico.
// `aoAvisar` sobe o aviso de remarcação para a Agenda: o cartão pode sair da lista (outro dia) e levaria o aviso junto.
function Detalhe({ a, nomeProf, nomeDe, profissionais, boxes, ehDono, aoAlterar, aoAvisar, cliente = null, loja = null }) {
  const [hist, setHist] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [remarcando, setRemarcando] = useState(false);
  const [quando, setQuando] = useState(() => aoLocal(a.inicio));
  const [prof, setProf] = useState(a.profissionalId);
  const [boxEscolhido, setBoxEscolhido] = useState(''); // '' = manter o box atual (o servidor tenta o mesmo e, se ocupado, outro livre)
  const [cupomAberto, setCupomAberto] = useState(false);
  const [chave, setChave] = useState('');
  useEffect(() => { let vivo = true; api.obter(a.id).then((r) => { if (vivo && r.ok) setHist(r.agendamento.historico); }); return () => { vivo = false; }; }, [a.id, a.status, a.inicio]);
  const executar = async (fn, aviso) => {
    if (ocupado) return;
    setOcupado(true); setErro('');
    const r = await fn();
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setCancelando(false); setRemarcando(false); setCupomAberto(false); setChave('');
    aoAlterar(aviso, r.agendamento);
  };
  const mudar = (status, aviso) => () => executar(() => api.mudarStatus(a.id, status), aviso);
  const remarcar = (e) => {
    e.preventDefault();
    const ts = doLocal(quando);
    if (ts === null) { setErro('Informe a nova data e hora.'); return; }
    executar(async () => {
      const r = await api.remarcar(a.id, { inicio: ts, ...(ehDono && prof !== a.profissionalId ? { profissionalId: prof } : {}), ...(boxEscolhido ? { boxId: boxEscolhido } : {}) });
      // horário mudou e o cliente tem telefone de WhatsApp válido (a loja só entra com a localização se ligou o envio no WhatsApp)
      if (r.ok && r.agendamento.inicio !== a.inicio && cliente && numeroWhatsapp(cliente.telefone)) {
        aoAvisar({
          tel: cliente.telefone,
          texto: textoReagendamento({ nomeEstab: loja ? loja.nome : '', nomeCliente: cliente.nome, servicos: a.servicos.map((x) => x.nome).join(', '), dataHora: `${fmtDayLong(r.agendamento.inicio)}, às ${fmtHM(r.agendamento.inicio)}`, endereco: loja ? loja.endereco : '', mapaUrl: loja ? loja.mapaUrl : '' }),
        });
      }
      // horário mudou mas não dá para avisar: diz isso (cliente sem telefone, ou atendimento sem cadastro); quem não lê Clientes não sabe o telefone e fica como antes
      else if (r.ok && r.agendamento.inicio !== a.inicio && (!a.clienteId || cliente)) aoAvisar({ semTelefone: true, semCadastro: !a.clienteId });
      // tem cadastro, mas a ficha não chegou (quem não lê Clientes, lista com erro, cadastro fora da lista): não fica em silêncio, diz que não deu para conferir o telefone
      else if (r.ok && r.agendamento.inicio !== a.inicio) aoAvisar({ naoConferido: true });
      return r;
    }, 'Agendamento remarcado.');
  };
  // Chamado direto do clique (sem await antes): o navegador só deixa abrir a aba nova nesse momento.
  const ativoStatus = a.status;
  const podeCupom = (ativoStatus === 'a_confirmar' || ativoStatus === 'confirmado') && a.origem !== 'atendimento'; // atendimento local nunca usa cupom
  return (
    <div className="cartao-detalhe" data-testid="agendamento-detalhe">
      <ul className="detalhe-itens">
        {a.servicos.map((s, i) => <li key={`${s.servicoId}-${i}`}>{s.nome} · {s.duracaoMin} min · {fmtMoney(s.preco)}{s.desconto > 0 ? ` (cupom −${fmtMoney(s.desconto)})` : ''}</li>)}
        {a.produtos.map((p) => <li key={p.materialId} data-testid="detalhe-produto">{p.qtd}× {p.nome} · {fmtMoney(p.preco * p.qtd)}{p.vendedorId && p.vendedorId !== a.profissionalId ? ` · vendeu ${nomeDe(p.vendedorId)}` : ''}</li>)}
      </ul>
      {a.estetica && (a.estetica.placa || a.estetica.box) && (
        <p className="detalhe-veiculo-real" data-testid="detalhe-veiculo"><Icone n="car" size={14} /> {rotuloVeiculo({ marca: a.estetica.marca, modelo: a.estetica.modelo, cor: a.estetica.cor, placa: a.estetica.placa })}{a.estetica.porte ? ` · porte ${ROTULO_PORTE[a.estetica.porte] || a.estetica.porte}` : ''}{a.estetica.box ? ` · ${a.estetica.box}` : ''}</p>
      )}
      <p className="muted">{fmtDateTime(a.inicio)} até {fmtHM(a.fim ?? a.inicio)} · com {nomeProf}{a.motivoCancelamento ? ` · cancelado (${a.motivoCancelamento})` : ''}</p>
      {erro && <Aviso tipo="erro" data-testid="agendamento-erro">{erro}</Aviso>}
      {a.cupom && <p data-testid="detalhe-cupom"><Icone n="key" size={14} /> Cupom {a.cupom.nome}: −{fmtMoney(a.desconto)} · a pagar {fmtMoney(a.total - a.desconto + a.totalProdutos)}</p>}
      {podeCupom && !a.cupom && !cupomAberto && !cancelando && !remarcando && <div className="acoes"><Btn tamanho="sm" onClick={() => { setCupomAberto(true); setErro(''); }} data-testid="acao-cupom">Aplicar cupom</Btn></div>}
      {podeCupom && a.cupom && !cancelando && !remarcando && <div className="acoes"><Btn tamanho="sm" disabled={ocupado} onClick={() => executar(() => api.retirarCupom(a.id), 'Cupom retirado.')} data-testid="acao-retirar-cupom">Retirar cupom</Btn></div>}
      {cupomAberto && (
        <form className="form-grade" onSubmit={(e) => { e.preventDefault(); executar(() => api.aplicarCupom(a.id, chave), 'Cupom aplicado.'); }} data-testid="cupom-form-agenda">
          <Campo rotulo="Chave do cupom"><input value={chave} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => { setChave(e.target.value); setErro(''); }} placeholder="XXXX-XXXX-XXXX" data-testid="cupom-chave-agenda" /></Campo>
          <div className="acoes">
            <Btn tamanho="sm" onClick={() => { setCupomAberto(false); setChave(''); setErro(''); }} data-testid="cupom-voltar">Voltar</Btn>
            <Btn variante="primario" tamanho="sm" type="submit" disabled={ocupado} data-testid="cupom-aplicar">{ocupado ? 'Aplicando…' : 'Aplicar'}</Btn>
          </div>
        </form>
      )}
      {!cancelando && !remarcando && (
        <div className="acoes">
          {ativoStatus === 'a_confirmar' && <Btn variante="primario" tamanho="sm" disabled={ocupado} onClick={mudar('confirmado', 'Agendamento confirmado.')} data-testid="acao-confirmar">Confirmar</Btn>}
          {(ativoStatus === 'a_confirmar' || ativoStatus === 'confirmado') && <Btn tamanho="sm" disabled={ocupado} onClick={mudar('concluido', 'Agendamento concluído.')} data-testid="acao-concluir">Concluir</Btn>}
          {ativoStatus === 'concluido' && <Btn tamanho="sm" disabled={ocupado} onClick={mudar('confirmado', 'Agendamento reaberto como confirmado.')} data-testid="acao-reabrir">Reabrir</Btn>}
          {ativoStatus === 'cancelado' && <Btn variante="primario" tamanho="sm" disabled={ocupado} onClick={mudar('a_confirmar', 'Agendamento reativado.')} data-testid="acao-reativar">Reativar</Btn>}
          {ativoStatus !== 'cancelado' && ativoStatus !== 'concluido' && <Btn tamanho="sm" disabled={ocupado} onClick={() => setRemarcando(true)} data-testid="acao-remarcar">Remarcar</Btn>}
          {ativoStatus !== 'cancelado' && <Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={() => setCancelando(true)} data-testid="acao-cancelar">Cancelar</Btn>}
        </div>
      )}
      {cancelando && (
        <div className="confirmar-linha" data-testid="cancelar-confirmacao">
          <span>Cancelar este agendamento?</span>
          <Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={mudar('cancelado', 'Agendamento cancelado.')} data-testid="cancelar-sim">Sim, cancelar</Btn>
          <Btn tamanho="sm" onClick={() => setCancelando(false)} data-testid="cancelar-nao">Voltar</Btn>
        </div>
      )}
      {remarcando && (
        <form className="form-grade" onSubmit={remarcar} data-testid="remarcar-form">
          <Campo rotulo="Nova data e hora"><input type="datetime-local" step={300} value={quando} onChange={(e) => { setQuando(e.target.value); setErro(''); }} data-testid="remarcar-quando" /></Campo>
          {ehDono && profissionais.length > 1 && (
            <Campo rotulo={Rot('profissional')}>
              <select value={prof} onChange={(e) => setProf(e.target.value)} data-testid="remarcar-prof">{profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
            </Campo>
          )}
          {a.estetica && a.estetica.boxId && boxes.length > 0 && (
            <Campo rotulo="Box">
              <select value={boxEscolhido} onChange={(e) => setBoxEscolhido(e.target.value)} data-testid="remarcar-box">
                <option value="">Manter {a.estetica.box || 'o box atual'}</option>
                {boxes.filter((b) => b.id !== a.estetica.boxId).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </Campo>
          )}
          <div className="acoes">
            <Btn tamanho="sm" onClick={() => { setRemarcando(false); setErro(''); }} data-testid="remarcar-cancelar">Voltar</Btn>
            <Btn variante="primario" tamanho="sm" type="submit" disabled={ocupado} data-testid="remarcar-salvar">{ocupado ? 'Salvando…' : 'Remarcar'}</Btn>
          </div>
        </form>
      )}
      {hist && hist.length > 0 && (
        <details className="historico">
          <summary data-testid="historico-abrir">Histórico ({hist.length})</summary>
          <ul data-testid="historico-lista">
            {hist.map((e, i) => <li key={i}><span className="muted">{e.em ? fmtDateTime(e.em) : ''}</span> · {e.autor}: {e.campo}{e.de ? ` de ${e.de}` : ''}{e.para ? ` para ${e.para}` : ''}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Calendario({ cursor, lista, aoEscolherDia }) {
  const inicio = weekStart(monthStart(cursor));
  const hoje = startOfDay(Date.now());
  const dias = Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
  const contagem = useMemo(() => {
    const m = new Map();
    for (const a of lista) if (a.status !== 'cancelado') m.set(ymd(a.inicio), (m.get(ymd(a.inicio)) || 0) + 1);
    return m;
  }, [lista]);
  return (
    <div className="cal-real" data-testid="calendario">
      <div className="cal-real-grade" role="grid">
        {DIAS_CURTOS.map((d) => <div key={d} className="cal-real-cab" role="columnheader">{d}</div>)}
        {dias.map((d) => {
          const n = contagem.get(ymd(d)) || 0;
          const fora = new Date(d).getMonth() !== new Date(cursor).getMonth();
          return (
            <button key={d} type="button" className={`cal-real-dia${fora ? ' fora' : ''}${d === hoje ? ' hoje' : ''}${n ? ' com' : ''}`} onClick={() => aoEscolherDia(d)} data-testid={`mes-dia-${ymd(d)}`} aria-label={`${fmtDayLong(d)}${n ? `, ${n} agendamento${n === 1 ? '' : 's'}` : ''}`}>
              <span className="cal-real-num">{new Date(d).getDate()}</span>
              {n > 0 && <span className="cal-real-cont" data-testid={`mes-cont-${ymd(d)}`}>{n}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Aviso depois de remarcar o horário: pergunta se avisa pelo WhatsApp (cliente com telefone) ou diz que não dá (sem telefone / sem cadastro).
function AvisoRemarcado({ avisar, aoFechar, aoErro }) {
  const avisarCliente = () => { const abriu = abrirWhatsapp(avisar.texto, avisar.tel); if (!abriu) aoErro('Não foi possível abrir o WhatsApp.'); aoFechar(); };
  if (avisar.naoConferido) {
    return (
      <div className="confirmar-linha" data-testid="avisar-nao-conferido-bloco">
        <span data-testid="avisar-nao-conferido">Horário remarcado. Não consegui conferir o telefone deste cliente (sem acesso a Clientes ou cadastro não encontrado): avise-o por onde costuma falar com ele.</span>
        <Btn tamanho="sm" onClick={aoFechar} data-testid="avisar-nao-conferido-ok">Entendi</Btn>
      </div>
    );
  }
  if (avisar.semTelefone) {
    return (
      <div className="confirmar-linha" data-testid="avisar-sem-telefone-bloco">
        <span data-testid="avisar-sem-telefone">{avisar.semCadastro ? 'Horário remarcado. Este atendimento é sem cadastro: não há telefone para avisar o cliente pelo WhatsApp.' : 'Horário remarcado. Cliente sem telefone: não dá para avisá-lo pelo WhatsApp. Cadastre o telefone na ficha do cliente.'}</span>
        <Btn tamanho="sm" onClick={aoFechar} data-testid="avisar-sem-telefone-ok">Entendi</Btn>
      </div>
    );
  }
  return (
    <div className="confirmar-linha" data-testid="avisar-whats">
      <span data-testid="avisar-whats-pergunta">Horário remarcado. Avisar o cliente pelo WhatsApp? Abrimos a conversa com a mensagem pronta; você confere e envia.</span>
      <p className="muted" data-testid="avisar-whats-texto" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{avisar.texto}</p>
      <Btn tamanho="sm" variante="primario" onClick={avisarCliente} data-testid="avisar-whats-sim">Avisar no WhatsApp</Btn>
      <Btn tamanho="sm" onClick={aoFechar} data-testid="avisar-whats-nao">Agora não</Btn>
    </div>
  );
}

export default function Agenda({ ehProprio = false, ehDono = false, meuId = '', nomeLoja = '', destaqueIds = [], foco = null, recarregar = 0 }) {
  const [modo, setModo] = useState('horarios');
  const [cursor, setCursor] = useState(() => startOfDay(Date.now()));
  const [diasAdiante, setDiasAdiante] = useState(7);
  const [selecionado, setSelecionado] = useState('todos');
  const [lista, setLista] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [linkCopiado, setLinkCopiado] = useState(false);
  // Link da página do cliente: o geral (#agendar) ou, para o profissional, o da própria agenda (#agendar-<id>). A loja vem do endereço, então não vai no link.
  // Um clique abre o WhatsApp (aba nova, mensagem pronta; sem await antes, senão o navegador bloqueia) e copia o link como reserva.
  const enviarLink = () => {
    const base = `${globalThis.location.origin}${globalThis.location.pathname}`;
    const link = montarLinkAgendamento({ base, profissionalId: ehProprio ? meuId : '' });
    const abriu = abrirWhatsapp(textoConvite(nomeLoja, link, localizacaoUrl));
    Promise.resolve(globalThis.navigator?.clipboard?.writeText(link)).then(() => { setLinkCopiado(true); setTimeout(() => setLinkCopiado(false), 2000); }, () => { if (!abriu) setErro('Não consegui abrir o WhatsApp nem copiar o link.'); });
  };
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState(null);
  const [atendendo, setAtendendo] = useState(false);
  const [clientes, setClientes] = useState(new Map());
  const [profs, setProfs] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [pendLink, setPendLink] = useState([]); // só o proprietário: o que falta cadastrar para o link do cliente ter horários
  const [trocaForma, setTrocaForma] = useState(null); // agendamento cuja forma de pagamento está sendo trocada (segurar o cartão)
  const [avisoRemarcar, setAvisoRemarcar] = useState(null); // { tel, texto } | { semTelefone }: fica na Agenda porque o cartão pode sair da lista ao mudar de dia
  const [fichas, setFichas] = useState(new Map()); // id → { nome, telefone }: só para avisar o cliente pelo WhatsApp (quem não lê Clientes fica sem o aviso)
  const [lojaInfo, setLojaInfo] = useState({ endereco: '', mapaUrl: '' });
  const [localizacaoUrl, setLocalizacaoUrl] = useState(''); // link do mapa: o servidor só o devolve quando a loja ligou o envio da localização no WhatsApp
  const ultima = useRef(0);

  useEffect(() => {
    apiClientes.listar().then((r) => { if (r.ok) { setClientes(new Map(r.clientes.map((c) => [c.id, c.apelido || c.nome]))); setFichas(new Map(r.clientes.map((c) => [c.id, { nome: c.apelido || c.nome, telefone: c.telefone }]))); } });
    apiProf.listar().then((r) => { if (r.ok) setProfs(r.profissionais); });
    if (ehDono) apiLink.obter().then((r) => { if (r.ok) setPendLink(r.link.pendencias); });
    apiLocal.obter().then((r) => { if (r.ok) { setLocalizacaoUrl(r.local.localizacaoWhatsappUrl); setLojaInfo(r.local.localizacaoNoWhatsapp ? { endereco: r.local.enderecoTexto, mapaUrl: r.local.localizacaoWhatsappUrl } : { endereco: '', mapaUrl: '' }); } });
    if (capAtiva('usaRecursoFisico')) apiBoxes.listar().then((r) => { if (r.ok) setBoxes(boxesAtivos(r.boxes)); });
  }, []);

  const de = modo === 'horarios' ? cursor : weekStart(monthStart(cursor));
  const ate = modo === 'horarios' ? addDays(cursor, 1 + diasAdiante) : addDays(de, 42);
  const emFundo = useRef(false); // consulta automática: se falhar, mantém a lista na tela (sem erro) e tenta de novo na próxima
  useEffect(() => {
    const n = ++ultima.current;
    const fundo = emFundo.current; emFundo.current = false;
    (async () => {
      const r = await api.listar({ de, ate });
      if (n !== ultima.current) return; // chegou resposta de uma consulta antiga
      if (!r.ok) { if (!fundo) { setErro(r.erro); setLista([]); } return; }
      setErro('');
      setLista((antes) => (antes && JSON.stringify(antes) === JSON.stringify(r.agendamentos) ? antes : r.agendamentos)); // igual: não redesenha
    })();
  }, [de, ate, versao]);
  // O cliente pode pedir, remarcar ou cancelar pelo link a qualquer hora: a agenda se atualiza sozinha (aba visível), sem fechar o cartão aberto.
  useAtualizacaoAutomatica(() => { emFundo.current = true; setVersao((v) => v + 1); });

  // Agendamento novo (aviso do Painel): busca na hora, sem esperar o ciclo automático.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    emFundo.current = true; setVersao((v) => v + 1);
  }, [recarregar]);
  // Tocou na faixa de aviso: vai ao dia do agendamento, abre o cartão e rola até ele (a rolagem acontece quando a lista chega).
  const [rolarPara, setRolarPara] = useState('');
  useEffect(() => {
    if (!foco || !foco.id) return undefined;
    let vivo = true;
    api.obter(foco.id).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setAviso('Não encontrei esse agendamento (pode ter sido apagado).'); return; }
      setModo('horarios'); setSelecionado('todos'); setCursor(startOfDay(r.agendamento.inicio)); setDiasAdiante(7); setAviso('');
      setAberto(r.agendamento.id); setRolarPara(r.agendamento.id); setVersao((v) => v + 1);
    });
    return () => { vivo = false; };
  }, [foco]);
  useEffect(() => {
    if (!rolarPara || !lista) return;
    const el = globalThis.document.querySelector(`[data-testid="agenda-real"] [data-id="${rolarPara.replace(/[^0-9A-Za-z-]/g, '')}"]`);
    if (!el) return; // a lista ainda é a anterior: tenta de novo quando chegar a do dia certo
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.querySelector('button.cartao')?.focus({ preventScroll: true });
    setRolarPara('');
  }, [rolarPara, lista]);

  const atendem = useMemo(() => profs.filter((p) => p.atende), [profs]);
  const nomeProf = (id) => (profs.find((p) => p.id === id) || {}).nome || Rot('profissional');
  const nomeCliente = (a) => (a.clienteId ? clientes.get(a.clienteId) : a.nomeAvulso) || (a.clienteId ? 'Cliente' : a.local || a.origem === 'atendimento' ? 'Atendimento local' : 'Sem cadastro');
  const visiveis = useMemo(() => (lista || []).filter((a) => selecionado === 'todos' || a.profissionalId === selecionado).sort((x, y) => x.inicio - y.inicio), [lista, selecionado]);
  const doDiaTodos = visiveis.filter((a) => a.inicio >= cursor && a.inicio < addDays(cursor, 1));
  // Cancelados do dia: uma linha só no fim, que abre os cartões ao tocar (pedido do Marcelo, 30/10).
  const { ativos: doDia, cancelados: canceladosDia } = separarCancelados(doDiaTodos);
  const [canceladosAbertos, setCanceladosAbertos] = useState(null); // início do dia com a linha aberta
  const abertoCancelados = canceladosAbertos === cursor;
  const futuros = visiveis.filter((a) => a.inicio >= addDays(cursor, 1) && ATIVOS.includes(a.status));
  const grupos = agruparPorDia(futuros);
  const agora = Date.now();
  const temMais = modo === 'horarios' && diasAdiante < 364;

  const alterou = (texto, novo) => {
    setAviso(novo && novo.conflitosPendentes && novo.conflitosPendentes.length ? `${texto} Há ${novo.conflitosPendentes.length} agendamento(s) a confirmar no mesmo horário.` : texto);
    setVersao((v) => v + 1);
  };
  const atendeu = (texto, ag) => {
    setAtendendo(false);
    apiClientes.listar().then((r) => { if (r.ok) { setClientes(new Map(r.clientes.map((c) => [c.id, c.apelido || c.nome]))); setFichas(new Map(r.clientes.map((c) => [c.id, { nome: c.apelido || c.nome, telefone: c.telefone }]))); } });
    setModo('horarios'); setCursor(startOfDay(ag.inicio)); setDiasAdiante(7); setAberto(null);
    alterou(texto, ag);
  };
  const irPara = (ts) => { setCursor(startOfDay(ts)); setAberto(null); setAviso(''); setDiasAdiante(7); };
  const passo = (n) => (modo === 'horarios' ? irPara(addDays(cursor, n)) : irPara(addMonths(cursor, n)));
  const mostrarSeletor = !ehProprio && atendem.length > 1;
  const titulo = modo === 'horarios' ? fmtDayLong(cursor) : fmtMonthYear(cursor);

  const cartao = (a, testid) => (
    <Cartao key={a.id} a={a} testid={testid} nomeCliente={nomeCliente(a)} nomeProf={nomeProf(a.profissionalId)} mostraProf={!ehProprio && selecionado === 'todos' && atendem.length > 1}
      aberto={aberto === a.id} aoAbrir={() => setAberto(aberto === a.id ? null : a.id)} aoSegurar={setTrocaForma} destaque={destaqueIds.includes(a.id)}>
      <Detalhe a={a} nomeProf={nomeProf(a.profissionalId)} nomeDe={nomeProf} profissionais={atendem} boxes={boxes} ehDono={ehDono} aoAlterar={alterou} aoAvisar={setAvisoRemarcar} cliente={a.clienteId ? fichas.get(a.clienteId) || null : null} loja={{ nome: nomeLoja, ...lojaInfo }} />
    </Cartao>
  );

  return (
    <section className="tela agenda-real" data-testid="agenda-real">
      <div className="abas" role="tablist" aria-label="Visão da agenda">
        <button type="button" role="tab" className={modo === 'horarios' ? 'on' : ''} aria-selected={modo === 'horarios'} onClick={() => { setModo('horarios'); setAberto(null); }} data-testid="aba-horarios">Horários</button>
        <button type="button" role="tab" className={modo === 'calendario' ? 'on' : ''} aria-selected={modo === 'calendario'} onClick={() => { setModo('calendario'); setAberto(null); }} data-testid="aba-calendario">Calendário</button>
      </div>
      <div className="agenda-barra">
        <Btn tamanho="sm" onClick={() => passo(-1)} aria-label={modo === 'horarios' ? 'Dia anterior' : 'Mês anterior'} data-testid="agenda-anterior"><Icone n="left" size={15} /></Btn>
        <Btn tamanho="sm" onClick={() => irPara(Date.now())} data-testid="agenda-hoje">Hoje</Btn>
        <Btn tamanho="sm" onClick={() => passo(1)} aria-label={modo === 'horarios' ? 'Próximo dia' : 'Próximo mês'} data-testid="agenda-proximo"><Icone n="right" size={15} /></Btn>
        <h2 className="agenda-titulo-real" data-testid="agenda-titulo">{titulo}</h2>
        <Btn tamanho="sm" onClick={enviarLink} aria-label="Enviar o link de agendamento pelo WhatsApp" title="Abre o WhatsApp com o link da página do cliente (o link também é copiado)" data-testid="agenda-link"><Icone n={linkCopiado ? 'check' : 'link'} size={15} />{linkCopiado ? 'Copiado' : 'Link Agenda'}</Btn>
        <Btn variante="primario" tamanho="sm" onClick={() => { setAtendendo(true); setAviso(''); }} disabled={atendendo || atendem.length === 0} data-testid="atender-abrir"><Icone n="plus" size={15} />Atender</Btn>
      </div>
      {atendendo && <Atender profissionais={atendem} equipe={profs} meuId={meuId} ehProprio={ehProprio} aoSalvar={atendeu} aoFechar={() => setAtendendo(false)} />}
      {mostrarSeletor && (
        <div className="seletor-chips" role="group" aria-label={Rot('profissional')} data-testid="seletor-profissionais">
          <button type="button" className={`chip${selecionado === 'todos' ? ' on' : ''}`} aria-pressed={selecionado === 'todos'} onClick={() => setSelecionado('todos')} data-testid="sel-todos">Todos</button>
          {atendem.map((p) => <button key={p.id} type="button" className={`chip${selecionado === p.id ? ' on' : ''}`} aria-pressed={selecionado === p.id} onClick={() => setSelecionado(p.id)} title={p.nome} data-testid={`sel-${p.id}`}>{abreviarNome(p.nome, 16)}</button>)}
        </div>
      )}
      {pendLink.length > 0 && <Aviso tipo="erro" data-testid="agenda-link-pendencia">O link do cliente está sem horários: {pendLink[0]}</Aviso>}
      {erro && <Aviso tipo="erro" data-testid="agenda-erro">{erro}</Aviso>}
      {aviso && <Aviso data-testid="agenda-aviso">{aviso}</Aviso>}
      {trocaForma && (
        <FormaPagamento quem={`${nomeCliente(trocaForma)} · ${fmtDateTime(trocaForma.inicio)}`} atual={trocaForma.formaPagamento || ''} aoFechar={() => setTrocaForma(null)}
          aoEscolher={async (k) => { const r = await api.mudarFormaPagamento(trocaForma.id, k); if (r.ok) alterou('Forma de pagamento alterada.', r.agendamento); return r; }} />
      )}
      {avisoRemarcar && <AvisoRemarcado avisar={avisoRemarcar} aoFechar={() => setAvisoRemarcar(null)} aoErro={setErro} />}
      {lista === null && <p className="muted" role="status" data-testid="agenda-carregando">Carregando…</p>}
      {lista !== null && modo === 'calendario' && <Calendario cursor={cursor} lista={visiveis} aoEscolherDia={(d) => { setModo('horarios'); irPara(d); }} />}
      {lista !== null && modo === 'horarios' && (
        <>
          <div className="agenda-dia-real" data-testid="agenda-dia">
            {doDiaTodos.length === 0 ? <p className="muted vazio" data-testid="agenda-vazio">Nenhum agendamento neste dia.</p> : doDia.map((a) => cartao(a, 'cartao'))}
            {canceladosDia.length > 0 && (
              <div className="cancelados-dia cancelados-dia-real" data-testid="cancelados-dia">
                <button type="button" className="cancelados-resumo" aria-expanded={abertoCancelados} onClick={() => setCanceladosAbertos(abertoCancelados ? null : cursor)} data-testid="cancelados-resumo">
                  <span>{rotuloCancelados(canceladosDia.length)}</span><Icone n={abertoCancelados ? 'up' : 'down'} size={15} />
                </button>
                {abertoCancelados && <div className="agenda-lista-real" data-testid="cancelados-cartoes">{canceladosDia.map((a) => cartao(a, 'cartao'))}</div>}
              </div>
            )}
          </div>
          <div className="agenda-proximos-real" data-testid="agenda-proximos">
            <h3 className="agenda-titulo-proximos-real">Próximos agendamentos</h3>
            {grupos.length === 0 ? <p className="muted" data-testid="proximos-vazio">Nenhum agendamento nos próximos {diasAdiante} dias.</p> : grupos.map((g) => (
              <div key={g.dia} className="agenda-grupo-real" data-testid="proximo-dia">
                <button type="button" className="link link-dia" onClick={() => irPara(g.dia)} data-testid="proximo-dia-ir">{rotuloDoGrupo(g.dia, agora)}</button>
                <div className="agenda-lista-real">{g.lista.map((a) => cartao(a, 'cartao-proximo'))}</div>
              </div>
            ))}
            {temMais && <Btn onClick={() => setDiasAdiante(diasAdiante + 7)} data-testid="proximos-mais">Ver mais 7 dias</Btn>}
          </div>
        </>
      )}
    </section>
  );
}
