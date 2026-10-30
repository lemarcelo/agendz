/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:b3ec830fb7 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { abreviarNome } from '../domain/abreviar.js';
import { LOJA_TROCAVEL, MODO_DEMO, agendamentosVisiveis, profissionaisVisiveis } from '../services/api.js';
import { baseDoLink, montarLinkAgendamento } from '../domain/link-publico.js';
import { ATIVOS, STATUS, boxesAtivos, ocupacaoDe, retiradaDe } from '../domain/rules.js';
import { faixasDoProfissional, excecaoDoDia, TIPOS_EXCECAO } from '../domain/schedule.js';
import { rotuloDoGrupo, separarCancelados, rotuloCancelados } from '../domain/agenda-grupos.js';
import { DIAS_CURTOS, addDays, addMonths, fmtDate, fmtDayLong, maiuscula1, fmtDiaMesSemana, fmtHM, fmtMonthYear, monthStart, sameDay, startOfDay, weekStart, fmtDateShort, fmtMoney } from '../domain/time.js';
import { cobrancasDoAgendamento } from '../domain/financeiro.js';
import { totalAcrescimos } from '../domain/reports.js';
import { Avatar, Btn, Etiquetas, Icon, StatusChip, Vazio } from './common.jsx';
import { nomeProfissional, nomeCliente, nomeServicos, textoBox, textoUltimo, textoVeiculo } from './format.js';
import { toast, useLocal, useStore } from './hooks.js';
import { MARCADORES, chavesAtivas, casaMarcadores, contarMarcadores, visualDoCartao } from '../domain/marcadores.js';
import { useOrdem } from './ordem.jsx';
import SeletorProfissionais from './SeletorProfissionais.jsx';
import { sanearModoAgenda, sanearRolagem } from '../domain/agenda-modo.js';
import { alternarMulti, escolherUnico, removerUm, sanearSelecao } from '../domain/selecao.js';
import { BotaoRemover, useGestosSelecao } from './selecao.jsx';
import { copiarTexto } from './clipboard.js';
import { abrirWhatsapp } from './whatsapp.js';
import { textoConvite } from '../domain/whatsapp.js';
import { rot } from '../domain/tipos.js';

const ordem = (a, b) => a.inicio - b.inicio;

// Agrupa (já ordenados) por dia: [{ dia, lista }]. Rótulo do grupo: "Amanhã · terça-feira, 29 de outubro" ou só a data por extenso.
function agruparPorDia(lista) {
  const grupos = [];
  for (const a of lista) {
    const dia = startOfDay(a.inicio);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.lista.push(a); else grupos.push({ dia, lista: [a] });
  }
  return grupos;
}

// Miniatura redonda do profissional (foto, ou inicial com cor própria) para os eventos do calendário.
function FotoProfissional({ u }) {
  if (!u) return null;
  return <span className="ev-foto" title={u.apelido || u.nome}><Avatar mini nome={u.apelido || u.nome} foto={u.foto} chave={u.id} /></span>;
}

function CartaoAgendamento({ a, st, agora, onClick, mostraBarb, testid = 'cartao' }) {
  const v = visualDoCartao(a, agora);
  return (
    <button type="button" className={`cartao st-${v.chave}`} onClick={onClick} data-testid={testid} data-status={v.chave}
      title={`${fmtHM(a.inicio)} ${nomeCliente(st, a)} · ${nomeServicos(st, a)}${a.veiculo ? ` · ${textoVeiculo(a)}` : ''} · ${v.rotulo}`}>
      <div className="cartao-topo">
        <div className="cartao-quem">
          <span className="cartao-nome" title={nomeCliente(st, a)} data-testid="cartao-cliente">{abreviarNome(nomeCliente(st, a), 24)}</span>
          <StatusChip a={a} agora={agora} pequeno />
        </div>
        <div className={`cartao-quando ${testid === 'cartao' ? 'quando-hoje' : 'quando-proximo'}`}><b className="cartao-data" data-testid="cartao-data">{fmtDiaMesSemana(a.inicio)}</b><strong className="cartao-hora">{fmtHM(a.inicio)}</strong></div>
      </div>
      <div className="cartao-servico" title={nomeServicos(st, a)} data-testid="cartao-servico">{nomeServicos(st, a)}</div>
      {a.veiculo && <div className="cartao-veiculo cartao-veiculo-centro" data-testid="cartao-veiculo"><Icon n="car" size={13} /> {textoVeiculo(a)}{textoBox(st, a) ? ` · ${textoBox(st, a)}` : ''}</div>}
      {mostraBarb && (
        <div className="cartao-profissional">
          <span className="cartao-prof" title={nomeProfissional(st, a)} data-testid="cartao-profissional"><FotoProfissional u={st.usuarios.find((x) => x.id === a.profissionalId)} />com <b>{abreviarNome(nomeProfissional(st, a))}</b></span>
        </div>
      )}
      <div className="cartao-rodape">
        <Etiquetas a={a} />
        {totalAcrescimos(a) > 0 && <span className="chip chip-acr" title="Valor a mais, separado do serviço">Acréscimo {fmtMoney(totalAcrescimos(a))}</span>}
        {(() => { const l = cobrancasDoAgendamento(st, a).filter((c) => c.status === 'paga' || c.status === 'pendente'); if (!l.length) return null; const pend = l.some((c) => c.status === 'pendente'); const pagas = l.some((c) => c.status === 'paga'); const k = pend ? 'pendente' : 'paga'; return <span className={`chip chip-p chip-cob-${k}`} data-testid="chip-pix">{pend ? (pagas ? 'Pix parcial' : 'Pix aguardando') : 'Pix pago'}</span>; })()}
        {a.faltaConfirmacao && a.status === STATUS.A_CONFIRMAR && <span className="chip chip-alerta"><Icon n="alert" size={12} /> Sem confirmação</span>}
        <span className="muted cartao-ultimo">{textoUltimo(st, a)}</span>
      </div>
    </button>
  );
}

function Mes({ cursor, evs, st, agora, onDia, onEvento, mostraBarb }) {
  const porId = new Map(st.usuarios.map((u) => [u.id, u]));
  const ini = weekStart(monthStart(cursor));
  const dias = Array.from({ length: 42 }, (_, i) => addDays(ini, i));
  const fim = dias.slice(35).every((d) => new Date(d).getMonth() !== new Date(cursor).getMonth()) ? 35 : 42;
  return (
    <div className="mes-rolagem">
      <div className="mes">
        {DIAS_CURTOS.map((d) => <div key={d} className="mes-cab">{d}</div>)}
        {dias.slice(0, fim).map((d) => {
          const lista = evs.filter((a) => sameDay(a.inicio, d)).sort(ordem);
          const fora = new Date(d).getMonth() !== new Date(cursor).getMonth();
          const ex = excecaoDoDia(st.estabelecimento.escala, d);
          const aberto = st.usuarios.some((u) => u.atende && faixasDoProfissional(st.estabelecimento, u, d).length);
          return (
            <div key={d} role="button" tabIndex={0} className={`mes-dia ${fora ? 'fora' : ''} ${sameDay(d, agora) ? 'hoje' : ''} ${aberto ? '' : 'fechado'}`} onClick={() => onDia(d)} onKeyDown={(e) => { if (e.key === 'Enter') onDia(d); }} data-testid="dia-mes">
              <div className="mes-num"><span>{new Date(d).getDate()}</span>{ex && ex.tipo !== 'horario' && <small title={ex.rotulo}>{ex.rotulo || TIPOS_EXCECAO[ex.tipo]}</small>}</div>
              <div className="mes-evs">
                {lista.slice(0, 3).map((a) => {
                  const v = visualDoCartao(a, agora);
                  return (
                    <button type="button" key={a.id} className={`pill st-${v.chave} ${a.status === STATUS.CANCELADO ? 'cancelado' : ''}`} onClick={(e) => { e.stopPropagation(); onEvento(a.id); }}>
                      {v.check ? <Icon n="check" size={10} stroke={3} /> : <i className="ponto" />}
                      <b>{fmtHM(a.inicio)}</b> {nomeCliente(st, a)}
                      {mostraBarb && <FotoProfissional u={porId.get(a.profissionalId)} />}
                    </button>
                  );
                })}
                {lista.length > 3 && <span className="mais">+{lista.length - 3} mais</span>}
              </div>
              {lista.length > 0 && (
                <span className="mes-cont" aria-label={`${lista.length} agendamentos`}>
                  {Object.entries(lista.reduce((m, a) => { const c = visualDoCartao(a, agora).chave; m[c] = (m[c] || 0) + 1; return m; }, {})).map(([c, n]) => <span key={c} className={`mes-ponto st-${c}`}>{n}</span>)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ultimaRolagem = new Map(); // rolagem da Agenda por usuário, em memória (na mesma sessão)

export default function Agenda({ user, onAbrir, onNovo }) {
  const { state: st, agora, loja: lojaSlug } = useStore();
  const ehProfissional = user.papel === 'profissional';
  // Duas formas de ver a agenda (v73): Horários (cartões do dia) e Calendário (só o mês). O modo escolhido fica lembrado por usuário neste navegador.
  const [modoSalvo, salvarModo] = useLocal(`agenda-modo:${user.id}`, 'horarios');
  const modo = sanearModoAgenda(modoSalvo);
  const view = modo === 'calendario' ? 'mes' : 'dia';
  const abrirDia = (d) => { setCursor(d); salvarModo('horarios'); };
  const [cursor, setCursor] = useState(() => startOfDay(agora));
  const [selSalva, salvarSel] = useLocal(`agenda-profissionais:${user.id}`, []);
  const viewEfetiva = view; // 'dia' = Horários, 'mes' = Calendário

  const profissionais = profissionaisVisiveis(st, user);
  // Clicar em outro profissional troca a seleção (não soma). Profissional só vê a própria agenda (a API também filtra).
  // Sem escolha lembrada (ou com um profissional que não existe mais): vem selecionado quem está logado, se atende; senão vem "Todos" (nenhum marcado).
  // "Todos" escolhido de propósito fica guardado como ['*'] (lista vazia = sem escolha lembrada).
  // Escolhas antigas guardadas como lista (filtro múltiplo) valem pelo primeiro nome que ainda existe.
  const padraoSel = profissionais.some((b) => b.id === user.id) ? user.id : '';
  const todosEscolhido = Array.isArray(selSalva) && selSalva[0] === '*';
  // Clique escolhe um só. Segurar, duplo clique (só mouse) ou Ctrl/Shift + clique junta vários; o X do cartão tira só aquele. Sempre fica ao menos um.
  const selecionados = ehProfissional ? [user.id] : todosEscolhido ? [] : sanearSelecao(selSalva, profissionais.map((b) => b.id), padraoSel);
  const setSel = (v) => { if (!ehProfissional) salvarSel(v.length ? v : ['*']); };
  const ativosSel = profissionais.filter((b) => !selecionados.length || selecionados.includes(b.id));
  const todos = agendamentosVisiveis(st, user).filter((a) => !selecionados.length || selecionados.includes(a.profissionalId));
  // Marcadores da legenda: clicar liga/desliga o filtro por caso no calendário (vale só nesta tela, não fica salvo). Os totais continuam os do período inteiro.
  // Segurar um marcador e arrastar muda a ordem dele (salva por usuário).
  const [marcados, setMarcados] = useState([]);
  // Clique = um só (clicar de novo no marcado limpa). Segurar, duplo clique (só mouse) ou Ctrl/Shift + clique = juntar com os outros.
  const ordemLegenda = useOrdem('legenda', chavesAtivas(), { eixo: 'xy', rotulo: (k) => MARCADORES.find((m) => m.k === k)?.rotulo ?? k, aoSegurar: (k) => setMarcados((m) => alternarMulti(m, k)) });
  const gestosStatus = useGestosSelecao({ sel: marcados, aoUnico: (k) => setMarcados(escolherUnico(marcados, k)), aoMulti: (k, base) => setMarcados(alternarMulti(base ?? marcados, k)), segurar: false });
  const exibidos = todos.filter((a) => casaMarcadores(a, marcados, agora));

  const mover = (dir) => setCursor(viewEfetiva === 'dia' ? addDays(cursor, dir) : addMonths(cursor, dir));
  const titulo = viewEfetiva === 'dia' ? fmtDayLong(cursor) : fmtMonthYear(cursor);

  const contagemHoje = (id) => todos.length >= 0 && agendamentosVisiveis(st, user).filter((a) => a.profissionalId === id && sameDay(a.inicio, agora) && ATIVOS.includes(a.status)).length;
  const proximo = (id) => agendamentosVisiveis(st, user).filter((a) => a.profissionalId === id && ATIVOS.includes(a.status) && a.status !== STATUS.CONCLUIDO && a.inicio >= agora).sort(ordem)[0];

  const [copiado, setCopiado] = useState(false);
  const linkAtivo = st.estabelecimento.linkAgendamento?.ativo !== false;
  // Link da página do cliente: o dono usa o geral; cada profissional, o da própria agenda (#agendar-<id>). Em Artifact só vale âncora simples, por isso #.
  // Um clique abre o WhatsApp (aba nova, com a mensagem pronta) e copia o link como reserva. Os dois começam já no clique.
  const copiarLink = () => {
    const base = baseDoLink(window.location);
    // Na demonstração a loja vem de ?loja=<slug>: o link leva junto, senão o cliente cairia na loja padrão. No site real a loja vem do endereço (o build com domínio ignora ?loja=).
    const lojaDemo = new URLSearchParams(window.location.search).get('loja');
    const busca = lojaDemo && /^[a-z0-9-]{1,40}$/.test(lojaDemo) && base ? `?loja=${lojaDemo}` : '';
    // Artifact: sem ?loja= nem endereço por loja, a loja escolhida no login vai dentro do link (#agendar@<loja>).
    const link = montarLinkAgendamento({ base, busca, profissionalId: ehProfissional ? user.id : '', lojaNoLink: MODO_DEMO && LOJA_TROCAVEL ? lojaSlug : '' });
    const copiou = copiarTexto(link);
    const abriu = abrirWhatsapp(textoConvite(st.estabelecimento.nome, link, st.estabelecimento.localizacaoNoWhatsapp && Number.isFinite(st.estabelecimento.latitude) ? `https://maps.google.com/?q=${st.estabelecimento.latitude},${st.estabelecimento.longitude}` : ''));
    copiou.then((ok) => {
      setCopiado(ok); if (ok) setTimeout(() => setCopiado(false), 2000);
      if (!abriu) toast(ok ? 'Não consegui abrir o WhatsApp. O link foi copiado: cole na conversa.' : 'Não consegui abrir o WhatsApp nem copiar o link.', 'erro');
    });
  };
  const escolher = (id) => setSel(id ? escolherUnico(selecionados, id, 1) : []);
  const alternarBarb = (id, base) => setSel(alternarMulti(base ?? selecionados, id, 1));
  const gestosBarb = useGestosSelecao({ sel: selecionados, aoUnico: escolher, aoMulti: alternarBarb });

  // Boxes agora (só no dia de hoje) e carros de serviços de vários dias que entraram antes e ainda estão no box neste dia.
  const boxesHoje = viewEfetiva === 'dia' && sameDay(cursor, agora) ? boxesAtivos(st).map((b) => ({ box: b, a: todos.find((a) => a.boxId === b.id && a.status === STATUS.CONFIRMADO && !a.local && (() => { const o = ocupacaoDe(st, a); return o && o.box[0] <= agora && agora < o.box[1]; })()) || null })) : [];
  const noBox = viewEfetiva === 'dia' ? exibidos.filter((a) => a.status === STATUS.CONFIRMADO && !a.local && a.inicio < startOfDay(cursor) && (retiradaDe(st, a) ?? 0) > startOfDay(cursor)).sort(ordem) : [];
  const exDia = viewEfetiva === 'dia' ? excecaoDoDia(st.estabelecimento.escala, cursor) : null;
  const listaDia = exibidos.filter((a) => sameDay(a.inicio, cursor)).sort(ordem);
  // Cancelados do dia ficam numa linha só no fim (abre ao tocar); se o filtro já pede "Cancelado", ficam na lista.
  const { ativos: ativosDia, cancelados: canceladosDia } = separarCancelados(listaDia, marcados.includes('cancelado'));
  const [canceladosAbertos, setCanceladosAbertos] = useState(null); // dia (início) com a linha aberta
  const abertoCancelados = canceladosAbertos === startOfDay(cursor);
  // Próximos agendamentos (v86): depois do dia que está na tela, os dias seguintes com agendamento, agrupados por dia (a partir de amanhã, 7 dias por vez).
  // Sem filtro de marcador, cancelados e faltas não entram (o que já passou do prazo é histórico, não "próximo").
  const [diasAdiante, setDiasAdiante] = useState(7);
  const fimProximos = addDays(startOfDay(cursor), 1 + diasAdiante);
  const futuros = viewEfetiva === 'dia' ? exibidos.filter((a) => a.inicio >= addDays(startOfDay(cursor), 1) && (marcados.length > 0 || ATIVOS.includes(a.status))).sort(ordem) : [];
  const gruposProximos = agruparPorDia(futuros.filter((a) => a.inicio < fimProximos));
  const temMaisAdiante = futuros.some((a) => a.inicio >= fimProximos);
  // Total de cada marcador da legenda no período que está na tela (dia ou mês), respeitando o filtro de profissionais.
  const [pIni, pFim] = viewEfetiva === 'dia' ? [startOfDay(cursor), addDays(startOfDay(cursor), 1)] : [monthStart(cursor), addMonths(monthStart(cursor), 1)];
  const contagem = contarMarcadores(todos.filter((x) => x.inicio >= pIni && x.inicio < pFim), agora);

  // A rolagem da página volta como o usuário deixou (na sessão, em memória; entre sessões, em localStorage quando o navegador permite).
  const chaveRolagem = `agenda-rolagem:${user.id}`;
  useEffect(() => {
    let salvo = ultimaRolagem.get(chaveRolagem);
    if (salvo === undefined) { try { salvo = sanearRolagem(localStorage.getItem(chaveRolagem)); } catch { salvo = 0; } }
    const alvo = sanearRolagem(salvo);
    const volta = requestAnimationFrame(() => window.scrollTo(0, alvo));
    let t = 0;
    const gravar = () => { const y = sanearRolagem(window.scrollY); ultimaRolagem.set(chaveRolagem, y); try { localStorage.setItem(chaveRolagem, String(y)); } catch { /* sem armazenamento: fica só em memória */ } };
    const aoRolar = () => { clearTimeout(t); t = setTimeout(gravar, 150); };
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => { cancelAnimationFrame(volta); clearTimeout(t); window.removeEventListener('scroll', aoRolar); }; // sem gravar aqui: ao sair da tela o navegador já pode ter zerado a rolagem
  }, [chaveRolagem]);
  const botaoLink = (
  <button type="button" className={`btn btn-link-agendar ${copiado ? 'copiado' : ''}`} onClick={copiarLink} disabled={!linkAtivo} aria-label="Enviar link de agendamento pelo WhatsApp"
    title={linkAtivo ? 'Abrir o WhatsApp com o link da página de agendamento do cliente (o link também é copiado)' : 'Link desligado em Estabelecimento > Regras'} data-testid="copiar-link">
    <Icon n={copiado ? 'check' : 'link'} size={17} /><span className="rotulo-link">{copiado ? 'Link copiado' : 'Link de agendamento'}</span><span className="rotulo-link-curto">{copiado ? 'Copiado' : 'Link Agenda'}</span>
  </button>
  );
  const botaoAtender = (
  <Btn variante="primario" icone="plus" onClick={() => onNovo({ profissionalId: selecionados.length === 1 ? selecionados[0] : ehProfissional ? user.id : '' })} data-testid="atender">Atender</Btn>
  );
  return (
    <section className="tela">
      {!ehProfissional ? (
        <SeletorProfissionais profissionais={profissionais} selecionados={selecionados} onEscolher={escolher} onAlternar={alternarBarb} onRemover={(id) => setSel(removerUm(selecionados, id, 1))} contagemHoje={contagemHoje} proximo={proximo} agora={agora} />
      ) : (
      <div className="filtros" role="group" aria-label={`Escolher a agenda do ${rot('profissional')}`}>
        {profissionais.map((b) => {
          const p = proximo(b.id);
          const on = selecionados.includes(b.id);
          return (
            <span className="marc" key={b.id}>
              <button type="button" className={`filtro ${on ? 'on' : ''}`} {...(ehProfissional ? {} : gestosBarb(b.id))} aria-pressed={on} disabled={ehProfissional} data-testid={`filtro-${b.id}`}
                title={ehProfissional ? undefined : 'Clique para ver só esta agenda · segure ou dê dois cliques para juntar com outras'}>
                <Avatar nome={b.apelido || b.nome} foto={b.foto} chave={b.id} />
                <span className="filtro-txt"><b>{b.apelido || b.nome}</b><small>{contagemHoje(b.id)} hoje{p ? ` · próx. ${sameDay(p.inicio, agora) ? '' : `${fmtDateShort(p.inicio)} `}${fmtHM(p.inicio)}` : ''}</small></span>
              </button>
              {on && selecionados.length > 1 && <BotaoRemover id={b.id} rotulo={b.apelido || b.nome} onClick={() => setSel(removerUm(selecionados, b.id, 1))} />}
            </span>
          );
        })}
      </div>
      )}

      <div className="agenda-topo" data-testid="agenda-topo">
        <div className="agenda-acoes">{botaoLink}{botaoAtender}</div>
        <div className="segmentado agenda-modos" role="group" aria-label="Como ver a agenda">
          {[['horarios', 'Horários'], ['calendario', 'Calendário']].map(([k, r]) => (
            <button key={k} type="button" className={modo === k ? 'on' : ''} onClick={() => salvarModo(k)} aria-pressed={modo === k} data-testid={`agenda-modo-${k}`}>{r}</button>
          ))}
        </div>
        <div className="barra-cal-nav">
          <Btn tamanho="sm" onClick={() => setCursor(startOfDay(agora))}>Hoje</Btn>
          <button type="button" className="icone-btn" onClick={() => mover(-1)} aria-label="Anterior"><Icon n="left" /></button>
          <button type="button" className="icone-btn" onClick={() => mover(1)} aria-label="Próximo"><Icon n="right" /></button>
          <h2 className="cal-titulo" data-testid="cal-titulo">{titulo}</h2>
        </div>
      </div>

      <div className="legenda" role="group" aria-label="Legenda de cores e total do período. Clique para filtrar por um status; segure ou dê dois cliques para juntar vários; arraste para mudar a ordem.">
        {ordemLegenda.ids.map((k) => {
          const m = MARCADORES.find((x) => x.k === k);
          const on = marcados.includes(k);
          return (
            <span className="marc" key={k}>
              <button type="button" className={`chip ${m.k === 'reagendado' ? 'chip-reag' : `st-${m.cor}`} ${on ? 'on' : ''} ${ordemLegenda.classe(k)}`.trim()} aria-pressed={on} aria-label={`${m.rotulo}: ${contagem[k]} no período`} data-testid={`legenda-${k}`}
                title={`${on && marcados.length === 1 ? 'Mostrar todos de novo' : `Mostrar só: ${m.rotulo}`} · segure ou dê dois cliques para juntar com outros · arraste para mudar a ordem`} {...gestosStatus(k)} {...ordemLegenda.props(k)}>
                {m.check ? <Icon n="check" size={12} stroke={3} /> : m.k === 'reagendado' ? null : <i className="ponto" />}<span className="chip-rot">{m.rotulo}</span>
                <b className="cont" data-testid={`cont-${k}`} aria-label={`${contagem[k]} no período`}>{contagem[k]}</b>
              </button>
              {on && marcados.length > 1 && <BotaoRemover id={k} rotulo={m.rotulo} onClick={() => setMarcados((x) => removerUm(x, k))} />}
            </span>
          );
        })}
        {marcados.length > 0 && <button type="button" className="chip chip-limpar" onClick={() => setMarcados([])} data-testid="legenda-limpar"><Icon n="x" size={12} stroke={3} /><span className="chip-rot">Limpar filtro</span></button>}
      </div>
      {marcados.length > 0 && <p className="muted filtro-ativo" role="status" data-testid="filtro-ativo">Mostrando só: {marcados.map((k) => MARCADORES.find((m) => m.k === k)?.rotulo).join(' ou ')}.</p>}

      {viewEfetiva === 'mes' && <Mes mostraBarb={ativosSel.length > 1} cursor={cursor} evs={exibidos} st={st} agora={agora} onDia={abrirDia} onEvento={onAbrir} />}

      {viewEfetiva === 'dia' && (
        <div className="agenda-horarios" data-testid="agenda-horarios">
          {boxesHoje.length > 0 && (
            <div className="boxes-agora" role="list" aria-label="Boxes agora" data-testid="boxes-agora">
              {boxesHoje.map(({ box, a }) => (
                <button type="button" role="listitem" key={box.id} className={`box-agora ${a ? `ocupado st-${visualDoCartao(a, agora).chave}` : 'livre'}`} disabled={!a} onClick={() => a && onAbrir(a.id)} data-testid={`box-agora-${box.id}`}>
                  <small>{box.nome}</small><b>{a ? textoVeiculo(a) || nomeCliente(st, a) : 'Livre'}</b>
                </button>
              ))}
            </div>
          )}
          {exDia && exDia.tipo !== 'horario' && <div className="faixa-ex"><Icon n="calendar" size={15} /> {exDia.rotulo || TIPOS_EXCECAO[exDia.tipo]} · sem atendimento</div>}
          <h3 className="agenda-titulo-dia">Agendamentos do dia <span className="chip chip-p" data-testid="dia-total">{ativosDia.length}</span></h3>
          {listaDia.length === 0 && <Vazio icone="calendar" titulo="Dia livre" texto={marcados.length ? "Nenhum agendamento com o marcador escolhido nesta data." : "Nenhum agendamento nesta data."} />}
          {noBox.length > 0 && (
            <div className="no-box" data-testid="carros-no-box">
              <h4>Carros no box desde dias anteriores</h4>
              <div className="cartoes agenda-cartoes">{noBox.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}</div>
            </div>
          )}
          <div className="cartoes agenda-cartoes" data-testid="agenda-cartoes">
            {ativosDia.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}
          </div>
          {canceladosDia.length > 0 && (
            <div className="cancelados-dia" data-testid="cancelados-dia">
              <button type="button" className="cancelados-resumo" aria-expanded={abertoCancelados} onClick={() => setCanceladosAbertos(abertoCancelados ? null : startOfDay(cursor))} data-testid="cancelados-resumo">
                <span>{rotuloCancelados(canceladosDia.length)}</span><Icon n={abertoCancelados ? 'up' : 'down'} size={15} />
              </button>
              {abertoCancelados && <div className="cartoes agenda-cartoes" data-testid="cancelados-cartoes">{canceladosDia.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}</div>}
            </div>
          )}
          {gruposProximos.length > 0 && (
            <div className="agenda-proximos" data-testid="agenda-proximos">
              <h3 className="agenda-titulo-proximos">Próximos agendamentos <span className="chip chip-p">{gruposProximos.reduce((n, g) => n + g.lista.length, 0)}</span></h3>
              {gruposProximos.map((g) => (
                <section key={g.dia} className="agenda-grupo-dia" aria-label={rotuloDoGrupo(g.dia, agora)} data-testid="proximo-dia">
                  <h4 className="agenda-dia-grupo"><button type="button" className="link-dia" onClick={() => setCursor(g.dia)} title="Ir para este dia">{rotuloDoGrupo(g.dia, agora)}</button> <span className="chip chip-p">{g.lista.length}</span></h4>
                  <div className="cartoes agenda-cartoes">{g.lista.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} testid="cartao-proximo" mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}</div>
                </section>
              ))}
            </div>
          )}
          {temMaisAdiante && <Btn onClick={() => setDiasAdiante(diasAdiante + 7)} data-testid="proximos-mais">Ver mais 7 dias</Btn>}
        </div>
      )}
    </section>
  );
}
