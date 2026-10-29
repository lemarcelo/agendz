/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Página do cliente no site real (#agendar), SEM login (5e-1): escolhe serviço e profissional, vê só horários livres, pede o horário com nome e telefone
// (cupom opcional) e acompanha ou cancela o que é dele. Fala só com `publico.*` de api-real.js (GET/POST /api/publico/*); a regra toda (horário livre,
// expediente, 24 h para cancelar, limite de 3 abertos, cupom) está no servidor. O acesso a cada horário é um token que a resposta do pedido entrega UMA vez;
// ele fica só neste aparelho (localStorage, dentro de try/catch: sem storage a página funciona, só não lembra dos horários na próxima visita).
// Remarcar entrou na 5e-2 (24 h ou mais, como cancelar). Código por telefone, lembretes e estética (veículo e porte) ficam para a 5e-3.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import { caminhoHttps } from '../../domain/localizacao.js';
import { adicionarReserva, lerReservas, limparReservas, removerReserva, sincronizarReservas } from '../../domain/reservas-local.js';
import React, { useEffect, useMemo, useState } from 'react';
import { publico } from '../../services/api-real.js';
import { fmtMoney } from '../../domain/time.js';
import { formatarTelefone } from '../../domain/rules.js';
import { Rot, rot } from '../../domain/tipos.js';
import { logoValida } from '../../domain/tema.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

// Datas sempre no fuso da loja (Brasília), não no do aparelho: o servidor entrega dias "AAAA-MM-DD" e horários em instantes.
const FUSO = 'America/Sao_Paulo';
const fmt = (o) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...o });
const hojeBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const somaDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const horaDe = (ts) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
const diaLongo = (ts) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ts));
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dowDe = (iso) => DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const diaDe = (iso) => Number(iso.slice(8, 10));
const mesDe = (iso) => MES[Number(iso.slice(5, 7)) - 1];
const fmtDur = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);

// ---- acessos guardados neste aparelho: [{ id, token }] (no máximo 20) ----
const TOKEN = /^[0-9a-f]{48}$/;
const chaveStorage = (slug) => `agendz-acessos-${String(slug || 'loja').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`;
function lerAcessos(slug) {
  try {
    const v = JSON.parse(localStorage.getItem(chaveStorage(slug)) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && TOKEN.test(String(x.token))).slice(-20) : [];
  } catch { return []; }
}
function gravarAcessos(slug, lista) {
  try { localStorage.setItem(chaveStorage(slug), JSON.stringify(lista.slice(-20))); } catch { /* sem storage: vale só nesta visita */ }
}

// ---- horários pedidos e dados do cliente, só neste navegador (domain/reservas-local.js): sem consultar a agenda; somem quando o horário passa ----
const chaveReservas = (slug) => `agendz-reservas-${String(slug || 'loja').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`;
function carregarReservas(slug) {
  try {
    const v = lerReservas(localStorage.getItem(chaveReservas(slug)), Date.now());
    if (!v.itens.length) localStorage.removeItem(chaveReservas(slug)); // nada que valha: não deixa nem o nome e o telefone para trás
    return v;
  } catch { return limparReservas(null, Date.now()); }
}
function salvarReservas(slug, dados) {
  try {
    if (!dados.itens.length) localStorage.removeItem(chaveReservas(slug));
    else localStorage.setItem(chaveReservas(slug), JSON.stringify(dados));
  } catch { /* sem storage: vale só nesta visita */ }
}
const diaSemana = (ts) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(ts)).replace('.', '').replace(',', '');

// Dia + horário livres: os dois vêm do servidor, que só devolve o que está livre. `fonte` ({ dias(de, n), horarios(dia) }) troca a consulta (remarcar um horário já marcado).
function DiaHora({ chave, diasMax, servicoIds, profissionalId, valor, aoEscolher, fonte }) {
  const hoje = useMemo(hojeBrasilia, []);
  const [janela, setJanela] = useState(14);
  const [dias, setDias] = useState(null);
  const [dia, setDia] = useState(null);
  const [horas, setHoras] = useState(null);
  const [erro, setErro] = useState('');
  const limite = Math.min(janela, diasMax);
  useEffect(() => {
    let vivo = true;
    setErro('');
    (async () => {
      const achados = [];
      for (let ini = 0; ini < limite; ini += 31) {
        const r = fonte ? await fonte.dias(somaDias(hoje, ini), Math.min(31, limite - ini)) : await publico.dias({ de: somaDias(hoje, ini), dias: Math.min(31, limite - ini), servicoIds, profissionalId });
        if (!vivo) return;
        if (!r.ok) { setErro(r.erro); setDias([]); return; }
        achados.push(...r.dias);
      }
      setDias(achados);
    })();
    return () => { vivo = false; };
  }, [chave, limite]);
  const diaAtual = dias && (dia && dias.includes(dia) ? dia : dias[0]) || null;
  useEffect(() => {
    if (!diaAtual) { setHoras([]); return undefined; }
    let vivo = true;
    setHoras(null);
    (fonte ? fonte.horarios(diaAtual) : publico.horarios({ data: diaAtual, servicoIds, profissionalId })).then((r) => { if (!vivo) return; if (r.ok) setHoras(r.horarios); else { setErro(r.erro); setHoras([]); } });
    return () => { vivo = false; };
  }, [chave, diaAtual]);
  const podeMais = limite < diasMax;
  if (dias === null) return <p className="muted" role="status" data-testid="pub-carregando">Procurando horários livres…</p>;
  return (
    <div className="pub-diahora">
      <div className="pub-dias" role="group" aria-label="Escolher o dia">
        {dias.map((d) => (
          <button type="button" key={d} className={`pub-dia ${d === diaAtual ? 'on' : ''}`} aria-pressed={d === diaAtual} onClick={() => setDia(d)} data-testid={`pub-dia-${d}`}>
            <small>{dowDe(d)}</small><b>{diaDe(d)}</b><small>{mesDe(d)}</small>
          </button>
        ))}
        {podeMais && <button type="button" className="pub-dia pub-mais" onClick={() => setJanela(Math.min(janela + 14, diasMax))} data-testid="pub-mais-dias"><Icone n="plus" size={16} /><small>Mais dias</small></button>}
      </div>
      {!dias.length && <p className="muted" data-testid="pub-sem-horarios">Não há horários livres {podeMais ? 'nesses dias. Toque em "Mais dias".' : `nos próximos ${diasMax} dias. Tente outro ${rot('profissional')} ou fale com a loja.`}</p>}
      {erro && <Aviso tipo="erro"><span data-testid="pub-erro-horarios">{erro}</span></Aviso>}
      {horas && horas.length > 0 && <p className="pub-dia-titulo">{diaLongo(horas[0].inicio)}</p>}
      <div className="pub-horas" role="group" aria-label="Escolher o horário">
        {(horas || []).map((h) => (
          <button type="button" key={h.inicio} className={`pub-hora ${valor === h.inicio ? 'on' : ''}`} aria-pressed={valor === h.inicio} onClick={() => aoEscolher(h)} data-testid={`pub-hora-${horaDe(h.inicio).replace(':', '')}`}>
            {horaDe(h.inicio)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Agendar({ pagina, loja, profissionalInicial, cliente, aoCriar, irParaMeus }) {
  const [etapa, setEtapa] = useState(1);
  const [srv, setSrv] = useState([]);
  const [barb, setBarb] = useState(profissionalInicial || '');
  const [escolha, setEscolha] = useState(null);
  const [nome, setNome] = useState(() => (cliente && cliente.nome) || '');
  const [tel, setTel] = useState(() => (cliente && cliente.telefone) || '');
  const [cupom, setCupom] = useState('');
  const [isca, setIsca] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(null);
  const servicos = pagina.servicos.filter((x) => srv.includes(x.id));
  const total = servicos.reduce((t, x) => t + x.preco, 0);
  const duracao = servicos.reduce((t, x) => t + x.duracao, 0);
  const chave = `${srv.join(',')}|${barb}`;
  const nomeBarb = (id) => pagina.profissionais.find((b) => b.id === id)?.nome || `Qualquer ${rot('profissional')}`;
  const alternar = (id) => { setSrv((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= 5 ? l : [...l, id])); setEscolha(null); };

  const enviar = async () => {
    if (enviando) return;
    setErro(''); setEnviando(true);
    const r = await publico.agendar({ nome, telefone: tel, servicoIds: srv, profissionalId: escolha?.profissionalId || barb, inicio: escolha?.inicio, cupomChave: cupom, site: isca });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      if (r.status === 409 && /ocupado/.test(r.erro)) { setEscolha(null); setEtapa(2); }
      return;
    }
    if (r.token) aoCriar({ id: r.agendamento.id, token: r.token }, { id: r.agendamento.id, inicio: r.agendamento.inicio, fim: r.agendamento.fim, servicos: r.agendamento.servicos, profissional: r.agendamento.profissional }, { nome, telefone: tel });
    setFeito(r.agendamento);
    setEtapa(4);
  };
  const recomecar = () => { setEtapa(1); setSrv([]); setEscolha(null); setFeito(null); setCupom(''); setErro(''); };

  if (etapa === 4 && feito) {
    return (
      <section className="pub-cartao" data-testid="pub-feito" aria-live="polite">
        <div className="pub-ok"><Icone n="check" size={26} /></div>
        <h2>Pedido enviado</h2>
        <p>{feito.servicos.join(', ')} com <b>{feito.profissional}</b><br /><b>{diaLongo(feito.inicio)}, {horaDe(feito.inicio)}</b></p>
        {feito.desconto > 0 && <p data-testid="pub-feito-cupom"><Icone n="key" size={14} /> Cupom {feito.cupom}: −{fmtMoney(feito.desconto)} · a pagar {fmtMoney(feito.total - feito.desconto)}</p>}
        <p className="muted">{loja.nome} vai confirmar o seu horário. Você acompanha em “Meus agendamentos” neste aparelho.</p>
        <div className="pub-linha">
          <Btn onClick={irParaMeus} data-testid="pub-ver-meus">Ver meus agendamentos</Btn>
          <Btn variante="fantasma" onClick={recomecar} data-testid="pub-novo">Agendar outro</Btn>
        </div>
      </section>
    );
  }

  return (
    <section className="pub-cartao">
      <ol className="pub-passos" aria-label="Etapas">
        {['Serviço', 'Dia e horário', 'Seus dados'].map((r, k) => <li key={r} className={k + 1 === etapa ? 'on' : k + 1 < etapa ? 'feito' : ''} aria-current={k + 1 === etapa ? 'step' : undefined}><span>{k + 1}</span>{r}</li>)}
      </ol>

      {etapa === 1 && (
        <div className="pub-bloco">
          <h2>O que vamos fazer?</h2>
          {!pagina.servicos.length && <p className="muted" data-testid="pub-sem-servicos">Nenhum serviço disponível para agendar por aqui. Fale com a loja.</p>}
          <div className="pub-lista">
            {pagina.servicos.map((x) => (
              <label key={x.id} className={`pub-item ${srv.includes(x.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={srv.includes(x.id)} onChange={() => alternar(x.id)} data-testid={`pub-srv-${x.id}`} />
                <span className="pub-item-txt"><b>{x.nome}</b><small className="muted">{fmtDur(x.duracao)}{x.antecedenciaH > 0 ? ` · agende com ${x.antecedenciaH} h de antecedência` : ''}</small></span>
                <span className="pub-preco">{fmtMoney(x.preco)}</span>
              </label>
            ))}
          </div>
          <h3>Com quem?</h3>
          <div className="pub-barbs" role="group" aria-label={Rot('profissional')}>
            <button type="button" className={`pub-barb ${barb === '' ? 'on' : ''}`} aria-pressed={barb === ''} onClick={() => { setBarb(''); setEscolha(null); }} data-testid="pub-barb-qualquer">Qualquer um</button>
            {pagina.profissionais.map((b) => <button type="button" key={b.id} className={`pub-barb ${barb === b.id ? 'on' : ''}`} aria-pressed={barb === b.id} onClick={() => { setBarb(b.id); setEscolha(null); }} data-testid={`pub-barb-${b.id}`}>{b.nome}</button>)}
          </div>
          <div className="pub-rodape">
            {servicos.length > 0 && <span className="muted">{fmtDur(duracao)} · {fmtMoney(total)}</span>}
            <Btn variante="primario" disabled={!srv.length} onClick={() => setEtapa(2)} data-testid="pub-continuar-1">Escolher horário</Btn>
          </div>
        </div>
      )}

      {etapa === 2 && (
        <div className="pub-bloco">
          <h2>Quando?</h2>
          <p className="muted">Só aparecem horários livres. Toque no dia e no horário.</p>
          <DiaHora chave={chave} diasMax={pagina.diasMax} servicoIds={srv} profissionalId={barb} valor={escolha?.inicio} aoEscolher={setEscolha} />
          {erro && <Aviso tipo="erro"><span data-testid="pub-erro">{erro}</span></Aviso>}
          <div className="pub-rodape">
            <Btn variante="fantasma" onClick={() => setEtapa(1)} data-testid="pub-voltar-1">Voltar</Btn>
            <Btn variante="primario" disabled={!escolha} onClick={() => { setErro(''); setEtapa(3); }} data-testid="pub-continuar-2">Continuar</Btn>
          </div>
        </div>
      )}

      {etapa === 3 && escolha && (
        <div className="pub-bloco">
          <h2>Seus dados</h2>
          <div className="pub-resumo" data-testid="pub-resumo">
            <b>{servicos.map((x) => x.nome).join(', ')}</b>
            <span>{diaLongo(escolha.inicio)}, {horaDe(escolha.inicio)} · {nomeBarb(escolha.profissionalId)}</span>
            <span className="muted">{fmtDur(duracao)} · {fmtMoney(total)}</span>
          </div>
          <form className="pub-form" onSubmit={(e) => { e.preventDefault(); enviar(); }} noValidate>
            <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="name" data-testid="pub-nome" /></Campo>
            <Campo rotulo="Telefone (WhatsApp, com DDD)"><input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(formatarTelefone(e.target.value))} maxLength={16} autoComplete="tel" placeholder="(51) 99999-9999" data-testid="pub-tel" /></Campo>
            <Campo rotulo="Cupom (opcional)"><input value={cupom} onChange={(e) => setCupom(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14))} maxLength={14} autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX" data-testid="pub-cupom" /></Campo>
            <input className="pub-isca" tabIndex={-1} aria-hidden="true" autoComplete="off" name="site" value={isca} onChange={(e) => setIsca(e.target.value)} data-testid="pub-isca" />
            {erro && <Aviso tipo="erro"><span data-testid="pub-erro">{erro}</span></Aviso>}
            <div className="pub-rodape">
              <Btn variante="fantasma" onClick={() => setEtapa(2)} data-testid="pub-voltar-2">Voltar</Btn>
              <button type="submit" className="btn btn-primario" disabled={enviando} data-testid="pub-enviar">{enviando ? 'Enviando…' : 'Pedir este horário'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function Meus({ loja, acessos, setAcessos, diasMax, aoSincronizar }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState(null);
  const [remarcando, setRemarcando] = useState(null); // { id, escolha }
  const [enviando, setEnviando] = useState(false);
  const tokens = acessos.map((a) => a.token).join(',');
  useEffect(() => {
    let vivo = true;
    if (!acessos.length) { setLista([]); return undefined; }
    publico.meus(acessos.map((a) => a.token)).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setLista([]); return; }
      setErro(''); setLista(r.agendamentos); aoSincronizar(r.agendamentos);
      const ids = new Set(r.agendamentos.map((a) => a.id));
      if (acessos.some((a) => !ids.has(a.id))) { const novos = acessos.filter((a) => ids.has(a.id)); gravarAcessos(loja.slug, novos); setAcessos(novos); } // acesso vencido some do aparelho
    });
    return () => { vivo = false; };
  }, [tokens]);
  if (lista === null) return <section className="pub-cartao"><p className="muted" role="status">Carregando…</p></section>;
  const futuros = lista.filter((a) => a.ativo);
  const passados = lista.filter((a) => !a.ativo).sort((a, b) => b.inicio - a.inicio);
  const cancelar = async (a) => {
    const acesso = acessos.find((x) => x.id === a.id);
    setConfirmando(null); setAviso(''); setErro('');
    const r = await publico.cancelar(a.id, acesso ? acesso.token : '');
    if (!r.ok) { setErro(r.erro); return; }
    setLista((l) => l.map((x) => (x.id === a.id ? r.agendamento : x))); aoSincronizar([r.agendamento]);
    setAviso('Horário cancelado.');
  };
  const fonteDe = (a) => {
    const t = (acessos.find((x) => x.id === a.id) || {}).token || '';
    return { dias: (de, n) => publico.diasRemarcar(a.id, t, { de, dias: n }), horarios: (dia) => publico.horariosRemarcar(a.id, t, { data: dia }) };
  };
  const remarcar = async (a) => {
    if (!remarcando || !remarcando.escolha) return;
    const acesso = acessos.find((x) => x.id === a.id);
    setEnviando(true); setAviso(''); setErro('');
    const r = await publico.remarcar(a.id, acesso ? acesso.token : '', remarcando.escolha.inicio);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setLista((l) => l.map((x) => (x.id === a.id ? r.agendamento : x))); aoSincronizar([r.agendamento]);
    setRemarcando(null);
    setAviso('Pedido de novo horário enviado. A loja confirma em breve.');
  };
  return (
    <section className="pub-cartao" data-testid="pub-meus">
      <h2>Meus agendamentos</h2>
      <p className="muted">Aqui aparecem os horários pedidos neste aparelho. Dá para remarcar ou cancelar com 24 horas ou mais de antecedência; antes disso, fale com {loja.nome}.</p>
      {aviso && <Aviso><span data-testid="pub-aviso">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro"><span data-testid="pub-erro-meus">{erro}</span></Aviso>}
      <h3>Próximos horários</h3>
      {!futuros.length && <p className="muted" data-testid="pub-sem-futuros">Você não tem horários marcados neste aparelho.</p>}
      <ul className="pub-ags">
        {futuros.map((a) => (
          <li key={a.id} className="pub-ag" data-testid={`pub-ag-${a.id}`}>
            <div className="pub-ag-topo">
              <div><b>{diaLongo(a.inicio)}, {horaDe(a.inicio)}</b><br /><span className="muted">{a.servicos.join(', ')} · {a.profissional}</span>
                {a.desconto > 0 && <><br /><span className="muted" data-testid={`pub-cupom-${a.id}`}><Icone n="key" size={13} /> Cupom {a.cupom}: −{fmtMoney(a.desconto)} · a pagar {fmtMoney(a.total - a.desconto)}</span></>}</div>
              <span className={`chip ${a.status === 'confirmado' ? 'st-azul' : 'st-roxo'}`}><i className="ponto" />{a.rotulo}</span>
            </div>
            {confirmando !== a.id && remarcando?.id !== a.id && (
              <div className="pub-linha">
                <Btn tamanho="sm" onClick={() => { setRemarcando({ id: a.id, escolha: null }); setConfirmando(null); setAviso(''); setErro(''); }} data-testid={`pub-remarcar-${a.id}`}>Remarcar</Btn>
                <Btn tamanho="sm" variante="perigo" onClick={() => { setConfirmando(a.id); setRemarcando(null); setAviso(''); }} data-testid={`pub-cancelar-${a.id}`}>Cancelar</Btn>
              </div>
            )}
            {remarcando?.id === a.id && (
              <div className="pub-confirma" data-testid={`pub-remarcando-${a.id}`}>
                {a.podeCancelar
                  ? (
                    <>
                      <p>Escolha o novo dia e horário. A loja precisa confirmar de novo.</p>
                      <DiaHora chave={`r-${a.id}-${a.inicio}`} diasMax={diasMax} fonte={fonteDe(a)} valor={remarcando.escolha?.inicio} aoEscolher={(h) => setRemarcando({ id: a.id, escolha: h })} />
                      <div className="pub-linha">
                        <Btn tamanho="sm" variante="primario" disabled={!remarcando.escolha || enviando} onClick={() => remarcar(a)} data-testid={`pub-remarcar-sim-${a.id}`}>{enviando ? 'Enviando…' : 'Pedir este horário'}</Btn>
                        <Btn tamanho="sm" onClick={() => setRemarcando(null)} data-testid={`pub-remarcar-nao-${a.id}`}>Voltar</Btn>
                      </div>
                    </>
                  )
                  : <><Aviso tipo="erro"><span data-testid={`pub-remarcar-prazo-${a.id}`}>Faltam menos de 24 horas, então não dá para remarcar por aqui. Fale com {loja.nome}.</span></Aviso><Btn tamanho="sm" onClick={() => setRemarcando(null)}>Voltar</Btn></>}
              </div>
            )}
            {confirmando === a.id && (
              <div className="pub-confirma">
                {a.podeCancelar
                  ? <><p>Cancelar este horário?</p><div className="pub-linha"><Btn tamanho="sm" variante="perigo" onClick={() => cancelar(a)} data-testid={`pub-cancelar-sim-${a.id}`}>Sim, cancelar</Btn><Btn tamanho="sm" onClick={() => setConfirmando(null)} data-testid={`pub-cancelar-nao-${a.id}`}>Voltar</Btn></div></>
                  : <><Aviso tipo="erro"><span data-testid={`pub-cancelar-prazo-${a.id}`}>Faltam menos de 24 horas, então não dá para cancelar por aqui. Fale com {loja.nome}.</span></Aviso><Btn tamanho="sm" onClick={() => setConfirmando(null)}>Voltar</Btn></>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {passados.length > 0 && (
        <>
          <h3>Anteriores</h3>
          <ul className="pub-ags pub-passados">{passados.map((a) => <li key={a.id} className="pub-ag" data-testid={`pub-ag-${a.id}`}><span>{diaLongo(a.inicio)}, {horaDe(a.inicio)} · {a.servicos.join(', ')}</span><span className="muted">{a.rotulo}</span></li>)}</ul>
        </>
      )}
    </section>
  );
}

export default function AgendarPublico({ loja, profissionalInicial, logado, aoVoltar }) {
  const [pagina, setPagina] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('agendar');
  const [acessos, setAcessos] = useState(() => lerAcessos(loja.slug));
  useEffect(() => {
    let vivo = true;
    publico.pagina().then((r) => { if (!vivo) return; if (r.ok) setPagina(r.pagina); else setErro(r.erro); });
    return () => { vivo = false; };
  }, []);
  const guardar = (acesso, item, cliente) => {
    const novos = [...acessos.filter((a) => a.id !== acesso.id), acesso].slice(-20); gravarAcessos(loja.slug, novos); setAcessos(novos);
    if (item) atualizarReservas((d) => adicionarReserva(d, { item, cliente }, Date.now()));
  };
  // Horários guardados neste navegador (sem consultar a agenda): o horário que passa sai sozinho, a cada minuto e ao voltar para a aba.
  const [reservas, setReservas] = useState(() => carregarReservas(loja.slug));
  const atualizarReservas = (f) => setReservas((d) => { const n = f(d); salvarReservas(loja.slug, n); return n; });
  useEffect(() => {
    const varrer = () => atualizarReservas((d) => limparReservas(d, Date.now()));
    const id = setInterval(varrer, 60000);
    document.addEventListener('visibilitychange', varrer);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', varrer); };
  }, []);
  const sincronizar = (lista) => atualizarReservas((d) => sincronizarReservas(d, lista.map((a) => ({ id: a.id, inicio: a.inicio, fim: a.fim, ativo: a.ativo })), Date.now()));
  const esquecer = () => { atualizarReservas(() => limparReservas(null, Date.now())); };
  const barb = pagina && pagina.profissionais.some((b) => b.id === profissionalInicial) ? profissionalInicial : '';
  return (
    <div className="pub" data-testid="pagina-publica">
      {logado && (
        <div className="pub-banner" role="status" data-testid="pub-banner">
          <span>Você está vendo a página do cliente.</span>
          <button type="button" className="link" onClick={aoVoltar} data-testid="pub-voltar-painel">Voltar ao painel</button>
        </div>
      )}
      <header className="pub-topo">
        <div className="pub-marca">
          {logoValida(loja.logo) ? <img className="marca-logo" src={loja.logo} alt="" width={72} height={72} /> : null}
          <h1 data-testid="pub-nome-loja">{loja.nome}</h1>
        </div>
        {pagina && pagina.ativo && (
          <div className="segmentado" role="group" aria-label="Seção">
            <button type="button" className={aba === 'agendar' ? 'on' : ''} aria-pressed={aba === 'agendar'} onClick={() => setAba('agendar')} data-testid="pub-aba-agendar">Agendar</button>
            <button type="button" className={aba === 'meus' ? 'on' : ''} aria-pressed={aba === 'meus'} onClick={() => setAba('meus')} data-testid="pub-aba-meus">Meus agendamentos</button>
          </div>
        )}
      </header>
      {pagina && pagina.ativo && pagina.endereco && (
        <p className="pub-contato muted" data-testid="pub-contato">
          <span data-testid="pub-endereco">{pagina.endereco}</span>
          {caminhoHttps(pagina.mapaUrl) && <> · <a href={`https://${caminhoHttps(pagina.mapaUrl)}`} target="_blank" rel="noopener noreferrer" data-testid="pub-mapa">Ver no mapa</a></>}
        </p>
      )}
      {erro && <Aviso tipo="erro"><span data-testid="pub-erro-pagina">{erro}</span></Aviso>}
      {!pagina && !erro && <p className="muted" role="status" data-testid="pub-carregando-pagina">Carregando…</p>}
      {pagina && !pagina.ativo && <section className="pub-cartao" data-testid="pub-desligado"><h2>Agendamento indisponível</h2><p className="muted">{pagina.aviso || `O agendamento pelo link não está disponível agora. Fale com ${loja.nome}.`}</p></section>}
      {pagina && pagina.ativo && (
        <div className={`pub-corpo${aba === 'agendar' && reservas.itens.length ? ' com-reservas' : ''}`}>
          {aba === 'agendar' && reservas.itens.length > 0 && (
            <aside className="pub-reservas" aria-label="Seus horários" data-testid="pub-reservas">
              <h2>Seus horários</h2>
              <ul>
                {reservas.itens.map((x) => (
                  <li key={x.id} data-testid={`pub-reserva-${x.id}`}>
                    <b className="pub-reserva-data">{diaSemana(x.inicio)}</b>
                    <strong className="pub-reserva-hora">{horaDe(x.inicio)}</strong>
                    <span className="muted">{x.servicos.join(', ')}{x.profissional ? ` · ${x.profissional}` : ''}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="link" onClick={() => setAba('meus')} data-testid="pub-reservas-ver">Remarcar ou cancelar</button>
              <p className="muted pub-reservas-nota">Guardados só neste aparelho; somem quando o horário passa. Seu nome e telefone ficam lembrados até lá.</p>
              <button type="button" className="link" onClick={esquecer} data-testid="pub-reservas-esquecer">Esquecer meus dados neste aparelho</button>
            </aside>
          )}
          <div className="pub-principal">
            {aba === 'agendar'
              ? <Agendar pagina={pagina} loja={loja} profissionalInicial={barb} cliente={reservas.cliente} aoCriar={guardar} irParaMeus={() => setAba('meus')} />
              : <Meus loja={loja} acessos={acessos} setAcessos={setAcessos} diasMax={pagina.diasMax} aoSincronizar={sincronizar} />}
          </div>
        </div>
      )}
      <p className="rodape-plataforma">Agendz</p>
    </div>
  );
}
