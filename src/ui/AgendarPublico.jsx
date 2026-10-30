/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:44e62ebcd1 */
import { caminhoHttps } from '../domain/localizacao.js';
import React, { useEffect, useMemo, useState } from 'react';
import { MODO_DEMO, publico, store } from '../services/api.js';
import { DIAS_CURTOS, fmtDayLong, fmtHM, fmtMoney, maiuscula1, startOfDay, ymd } from '../domain/time.js';
import { formatarTelefone, telefoneBrasileiro } from '../domain/rules.js';
import { EXEMPLO_PORTE, PORTE_PADRAO, formatarPlaca, limparVeiculoComRegras, placaValida, resumoVeiculo, tipoPlaca } from '../domain/veiculos.js';
import { Aviso, Btn, Campo, Icon } from './common.jsx';
import { LogoMarca, RodapePlataforma } from './Marca.jsx';
import { useLocal, useStore } from './hooks.js';
import { Rot, cap, rot } from '../domain/tipos.js';

// Página do cliente (sem login): pede um horário com nome e telefone e depois gerencia só os próprios agendamentos.
// Fala só com `publico.*`: nunca vê quem ocupa os outros horários.
const hojeTs = () => startOfDay(store.agora());
const diaCurto = (d) => `${DIAS_CURTOS[new Date(d).getDay()]}`;
const mesCurto = (d) => new Date(d).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

const fmtDur = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);
const veiculoTxt = (v) => (v ? `${v.modelo} · ${v.placa}` : '');

// Dia + horário livres. Os dois vêm de funções que só devolvem o que está livre.
function DiaHora({ chave, obterDias, obterHorarios, diasMax, valor, aoEscolher, id = 'pub' }) {
  const snap = useStore();
  const [janela, setJanela] = useState(14);
  const [dia, setDia] = useState(null);
  const dias = useMemo(() => obterDias(hojeTs(), Math.min(janela, diasMax)), [snap.state, chave, janela, diasMax]);
  const diaAtual = dia && dias.includes(dia) ? dia : dias[0] || null;
  const horas = useMemo(() => (diaAtual ? obterHorarios(diaAtual) : []), [snap.state, chave, diaAtual]);
  const podeMais = janela < diasMax;
  return (
    <div className="pub-diahora">
      <div className="pub-dias" role="group" aria-label="Escolher o dia">
        {dias.map((d) => (
          <button type="button" key={d} className={`pub-dia ${d === diaAtual ? 'on' : ''}`} aria-pressed={d === diaAtual} onClick={() => setDia(d)} data-testid={`${id}-dia-${ymd(d)}`}>
            <small>{diaCurto(d)}</small><b>{new Date(d).getDate()}</b><small>{mesCurto(d)}</small>
          </button>
        ))}
        {podeMais && <button type="button" className="pub-dia pub-mais" onClick={() => setJanela(Math.min(janela + 14, diasMax))} data-testid={`${id}-mais-dias`}><Icon n="plus" size={16} /><small>Mais dias</small></button>}
      </div>
      {!dias.length && <p className="muted" data-testid={`${id}-sem-horarios`}>Não há horários livres {podeMais ? 'nesses dias. Toque em "Mais dias".' : `nos próximos ${diasMax} dias. Tente outro ${rot('profissional')} ou serviço.`}</p>}
      {diaAtual && <p className="pub-dia-titulo">{maiuscula1(fmtDayLong(diaAtual))}</p>}
      <div className="pub-horas" role="group" aria-label="Escolher o horário">
        {horas.map((h) => (
          <button type="button" key={h.inicio} className={`pub-hora ${valor === h.inicio ? 'on' : ''}`} aria-pressed={valor === h.inicio} onClick={() => aoEscolher(h)} data-testid={`${id}-hora-${fmtHM(h.inicio).replace(':', '')}`}>
            {fmtHM(h.inicio)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Cabecalho({ cfg, aba, setAba }) {
  return (
    <header className="pub-topo">
      <div className="pub-marca"><LogoMarca comNome tamanho={72} /></div>
      {(cfg.endereco || cfg.telefone) && (
        <p className="pub-contato muted" data-testid="pub-contato">
          {cfg.endereco && <span>{cfg.endereco} · <a href={`https://${caminhoHttps(cfg.mapaUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.endereco)}`)}`} target="_blank" rel="noopener noreferrer" data-testid="pub-mapa">Ver no mapa</a></span>}
          {cfg.telefone && <span>{cfg.telefone}</span>}
        </p>
      )}
      <div className="segmentado" role="group" aria-label="Seção">
        <button type="button" className={aba === 'agendar' ? 'on' : ''} aria-pressed={aba === 'agendar'} onClick={() => setAba('agendar')} data-testid="pub-aba-agendar">Agendar</button>
        <button type="button" className={aba === 'meus' ? 'on' : ''} aria-pressed={aba === 'meus'} onClick={() => setAba('meus')} data-testid="pub-aba-meus">Meus agendamentos</button>
      </div>
    </header>
  );
}

function Agendar({ cfg, profissionalInicial, token, setToken, irParaMeus }) {
  // Tipo sem veículo (barbearia): a etapa do veículo some e o preço e a duração são os do serviço. Os números das etapas seguem os da estética (0 = veículo).
  const usaVeiculo = cap({ tipo: cfg.tipo }, 'usaVeiculo');
  const desl = usaVeiculo ? 0 : 1;
  const preco = (x) => (usaVeiculo ? x.precos[porte || PORTE_PADRAO] ?? 0 : x.preco ?? 0); // sem porte (dono tirou a obrigatoriedade) vale o médio
  const minutos = (x) => (usaVeiculo ? x.duracoes[porte || PORTE_PADRAO] ?? 0 : x.duracao ?? 0);
  const dur = (m) => (usaVeiculo ? fmtDur(m) : `${m} min`);
  const [etapa, setEtapa] = useState(desl);
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  const [marca, setMarca] = useState('');
  const [cor, setCor] = useState('');
  const [porte, setPorte] = useState('');
  const [srv, setSrv] = useState([]);
  const [barb, setBarb] = useState(profissionalInicial || '');
  const [escolha, setEscolha] = useState(null);
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [isca, setIsca] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(null);
  const [lemb, setLemb] = useState(null);
  const [usaPlano, setUsaPlano] = useState(false); // o telefone é de quem tem plano com atendimento para este horário (só sim ou não)
  const servicos = cfg.servicos.filter((x) => srv.includes(x.id));
  const total = servicos.reduce((t, x) => t + preco(x), 0);
  const duracao = servicos.reduce((t, x) => t + minutos(x), 0);
  const multiDia = servicos.some((x) => x.multiDia);
  const chave = `${srv.join(',')}|${barb}|${porte}`;
  const nomeBarb = (id) => cfg.profissionais.find((b) => b.id === id)?.nome || `Qualquer ${rot('profissional')}`;
  const alternar = (id) => { setSrv((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); setEscolha(null); };
  const categorias = useMemo(() => {
    const m = new Map();
    for (const x of cfg.servicos) { const k = x.categoria || 'Serviços'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return [...m.entries()];
  }, [cfg.servicos]);
  const placaOk = placaValida(placa);
  const exV = cfg.exigeVeiculo || ['placa', 'modelo', 'porte']; // o que o dono marcou como obrigatório (Estabelecimento > Regras > Link)
  const veiculoOk = limparVeiculoComRegras({ placa, modelo, porte }, exV).ok;
  const rotuloPorte = (cfg.portes || []).find((x) => x.id === porte)?.nome || '';
  const textoV = [modelo.trim(), placa && formatarPlaca(placa), rotuloPorte && `porte ${rotuloPorte.toLowerCase()}`].filter(Boolean).join(' · ');
  const estrela = (k) => (exV.includes(k) ? ' *' : '');

  // Avisa antes de pedir: "este horário usa um atendimento do seu plano". Só consulta com o telefone completo; o servidor responde apenas sim ou não.
  useEffect(() => {
    setUsaPlano(false);
    if (etapa !== 3 || !escolha || !telefoneBrasileiro(tel)) return;
    const r = publico.usoDoPlano({ telefone: tel, servicoIds: srv, inicio: escolha.inicio });
    if (r.ok && r.usaPlano) setUsaPlano(true);
  }, [etapa, tel, srv, escolha]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = () => {
    setErro(''); setEnviando(true);
    const r = publico.agendar({ nome, telefone: tel, ...(usaVeiculo ? { placa, marca, modelo, cor, ...(porte ? { porte } : {}) } : {}), servicoIds: srv, profissionalId: escolha?.profissionalId || barb, inicio: escolha?.inicio, site: isca });
    setEnviando(false);
    if (!r.ok) { setErro(r.erros[0]); if (/ocupado/.test(r.erros[0])) { setEscolha(null); setEtapa(2); } return; }
    if (r.token) setToken(r.token); setFeito({ usouPlano: !!r.usouPlano, semTelefone: !r.token, inicio: escolha.inicio, profissionalId: escolha.profissionalId, servicos: servicos.map((x) => x.nome), veiculo: usaVeiculo ? [modelo.trim(), placa && formatarPlaca(placa)].filter(Boolean).join(' · ') : '' });
    setEtapa(4);
  };
  const lembrar = (quer) => { const r = publico.lembretes(token, quer); if (r.ok) setLemb(quer); else setErro(r.erros[0]); };
  const recomecar = () => { setEtapa(desl); setSrv([]); setEscolha(null); setFeito(null); setLemb(null); setErro(''); };

  if (etapa === 4 && feito) {
    return (
      <section className="pub-cartao" data-testid="pub-feito" aria-live="polite">
        <div className="pub-ok"><Icon n="check" size={26} stroke={3} /></div>
        <h2>Pedido enviado</h2>
        <p>{feito.servicos.join(', ')}{feito.veiculo ? <> para <b>{feito.veiculo}</b></> : null} com <b>{nomeBarb(feito.profissionalId)}</b><br /><b>{fmtDayLong(feito.inicio)}, {fmtHM(feito.inicio)}</b></p>
        {feito.usouPlano && <p data-testid="pub-feito-plano"><Icon n="ticket" size={14} /> Este horário usa um atendimento do seu plano.</p>}
        <p className="muted">{!feito.semTelefone ? `${cfg.nome} vai confirmar o seu horário. Você acompanha em “Meus agendamentos”.` : `${cfg.nome} vai ver o seu pedido e confirmar o horário. Como não deixou telefone, a loja não consegue avisar você: guarde o dia e a hora.`}</p>
        {!feito.semTelefone && <div className="pub-pergunta" data-testid="pub-lembretes-pergunta">
          <b>Quer receber lembretes?</b>
          <span className="muted">Avisamos 24 horas e 2 horas antes do seu horário.</span>
          {lemb === null ? (
            <div className="pub-linha">
              <Btn variante="primario" onClick={() => lembrar(true)} data-testid="pub-lembrete-sim">Sim, quero</Btn>
              <Btn onClick={() => lembrar(false)} data-testid="pub-lembrete-nao">Agora não</Btn>
            </div>
          ) : <p data-testid="pub-lembrete-resp"><Icon n="check" size={14} stroke={3} /> {lemb ? 'Combinado! Vamos avisar você.' : 'Tudo bem, sem lembretes. Você pode mudar em “Meus agendamentos”.'}</p>}
        </div>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="pub-linha">
          {!feito.semTelefone && <Btn onClick={irParaMeus} data-testid="pub-ver-meus">Ver meus agendamentos</Btn>}
          <Btn variante="fantasma" onClick={recomecar} data-testid="pub-novo">Agendar outro</Btn>
        </div>
      </section>
    );
  }

  return (
    <section className="pub-cartao">
      <ol className="pub-passos" aria-label="Etapas">
        {['Veículo', 'Serviço', 'Dia e horário', 'Seus dados'].slice(desl).map((r, k) => { const i = k + desl; return <li key={r} className={i === etapa ? 'on' : i < etapa ? 'feito' : ''} aria-current={i === etapa ? 'step' : undefined}><span>{k + 1}</span>{r}</li>; })}
      </ol>

      {etapa === 0 && usaVeiculo && (
        <div className="pub-bloco">
          <h2>Qual é o seu veículo?</h2>
          <p className="muted">O porte define o preço e o tempo de cada serviço.</p>
          <div className="pub-form">
            <Campo rotulo={`Placa${estrela('placa')}`} dica="Formato antigo (ABC-1234) ou Mercosul (ABC1D23)." erro={placa && !placaOk ? 'Placa inválida.' : undefined}>
              <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8))} maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder="ABC1D23" data-testid="pub-placa" />
            </Campo>
            <Campo rotulo={`Modelo${estrela('modelo')}`}><input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={40} placeholder="Ex.: Onix, Corolla, Hilux" autoComplete="off" data-testid="pub-modelo" /></Campo>
            <div className="pub-duas">
              <Campo rotulo="Marca (opcional)"><input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={30} autoComplete="off" data-testid="pub-marca" /></Campo>
              <Campo rotulo="Cor (opcional)"><input value={cor} onChange={(e) => setCor(e.target.value)} maxLength={20} autoComplete="off" data-testid="pub-cor" /></Campo>
            </div>
            <div className="campo"><span className="campo-rotulo" id="pub-porte-r">{`Porte${estrela('porte')}`}</span>
              <div className="pub-portes" role="group" aria-labelledby="pub-porte-r">
                {cfg.portes.map((x) => (
                  <button type="button" key={x.id} className={`pub-porte ${porte === x.id ? 'on' : ''}`} aria-pressed={porte === x.id} onClick={() => { setPorte(x.id); setEscolha(null); }} data-testid={`pub-porte-${x.id}`}>
                    <b>{x.nome}</b><small>{EXEMPLO_PORTE[x.id].replace('Ex.: ', '')}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="pub-rodape">
            <span className="muted">{placaOk ? `Placa ${tipoPlaca(placa) === 'mercosul' ? 'Mercosul' : 'antiga'} ✓` : ''}</span>
            <Btn variante="primario" disabled={!veiculoOk} onClick={() => setEtapa(1)} data-testid="pub-continuar-0">Escolher serviço</Btn>
          </div>
        </div>
      )}

      {etapa === 1 && (
        <div className="pub-bloco">
          <h2>O que vamos fazer?</h2>
          {usaVeiculo && <p className="muted" data-testid="pub-veiculo-atual">{textoV || 'Sem dados do veículo'} <button type="button" className="link" onClick={() => setEtapa(0)} data-testid="pub-trocar-veiculo">Trocar</button></p>}
          {categorias.map(([cat, lista]) => (
            <div key={cat} className="pub-cat" role="group" aria-label={cat}>
              {categorias.length > 1 && <h3>{cat}</h3>}
              <div className="pub-lista">
                {lista.map((x) => (
                  <label key={x.id} className={`pub-item ${srv.includes(x.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={srv.includes(x.id)} onChange={() => alternar(x.id)} data-testid={`pub-srv-${x.id}`} />
                    <span className="pub-item-txt"><b>{x.nome}</b><small className="muted">{x.multiDia ? 'Vários dias: você deixa o carro e retira quando estiver pronto' : dur(minutos(x))}{x.combo ? ' · combo' : ''}</small></span>
                    <span className="pub-preco">{fmtMoney(preco(x))}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <h3>Com quem?</h3>
          <div className="pub-barbs" role="group" aria-label={Rot('profissional')}>
            <button type="button" className={`pub-barb ${barb === '' ? 'on' : ''}`} aria-pressed={barb === ''} onClick={() => { setBarb(''); setEscolha(null); }} data-testid="pub-barb-qualquer">Qualquer um</button>
            {cfg.profissionais.map((b) => <button type="button" key={b.id} className={`pub-barb ${barb === b.id ? 'on' : ''}`} aria-pressed={barb === b.id} onClick={() => { setBarb(b.id); setEscolha(null); }} data-testid={`pub-barb-${b.id}`}>{b.nome}</button>)}
          </div>
          <div className="pub-rodape">
            {servicos.length > 0 && <span className="muted">{multiDia ? 'Vários dias' : dur(duracao)} · {fmtMoney(total)}</span>}
            {usaVeiculo && <Btn variante="fantasma" onClick={() => setEtapa(0)} data-testid="pub-voltar-0">Voltar</Btn>}
            <Btn variante="primario" disabled={!srv.length} onClick={() => setEtapa(2)} data-testid="pub-continuar-1">Escolher horário</Btn>
          </div>
        </div>
      )}

      {etapa === 2 && (
        <div className="pub-bloco">
          <h2>{multiDia ? 'Quando você deixa o carro?' : 'Quando?'}</h2>
          <p className="muted">Só aparecem horários livres. Toque no dia e no horário.{multiDia ? ` A retirada é combinada com ${cfg.nome}.` : ''}</p>
          <DiaHora chave={chave} diasMax={cfg.diasMax} valor={escolha?.inicio}
            obterDias={(de, n) => publico.diasLivres({ profissionalId: barb, servicoIds: srv, porte, de, dias: n })}
            obterHorarios={(d) => publico.horarios({ profissionalId: barb, servicoIds: srv, porte, dayTs: d })}
            aoEscolher={setEscolha} />
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="pub-rodape">
            <Btn variante="fantasma" onClick={() => setEtapa(1)} data-testid={`pub-voltar-${1 - desl}`}>Voltar</Btn>
            <Btn variante="primario" disabled={!escolha} onClick={() => { setErro(''); setEtapa(3); }} data-testid="pub-continuar-2">Continuar</Btn>
          </div>
        </div>
      )}

      {etapa === 3 && escolha && (
        <div className="pub-bloco">
          <h2>Seus dados</h2>
          <div className="pub-resumo" data-testid="pub-resumo">
            <b>{servicos.map((x) => x.nome).join(', ')}</b>
            {usaVeiculo && textoV && <span>{textoV}</span>}
            <span>{fmtDayLong(escolha.inicio)}, {fmtHM(escolha.inicio)} · {nomeBarb(escolha.profissionalId)}</span>
            <span className="muted">{multiDia ? 'Vários dias' : dur(duracao)} · {fmtMoney(total)}</span>
          </div>
          {usaPlano && <p className="pub-aviso-plano" role="status" data-testid="pub-usa-plano"><Icon n="ticket" size={14} /> Este horário usa um atendimento do seu plano.</p>}
          <form className="pub-form" onSubmit={(e) => { e.preventDefault(); enviar(); }} noValidate>
            <Campo rotulo={cfg.exigeNome === false ? 'Nome, se quiser' : 'Nome'}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="name" data-testid="pub-nome" /></Campo>
            <Campo rotulo={cfg.exigeTelefone === false ? 'Telefone (WhatsApp), se quiser' : 'Telefone (WhatsApp)'} dica={cfg.exigeTelefone === false ? 'Opcional. Com telefone avisamos do seu horário e você acompanha por aqui; sem ele, só a loja vê o seu pedido.' : 'Com DDD. Só usamos para falar do seu horário.'}><input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(formatarTelefone(e.target.value))} maxLength={16} autoComplete="tel" placeholder="(51) 99999-9999" data-testid="pub-telefone" /></Campo>
            <input className="pub-isca" tabIndex={-1} aria-hidden="true" autoComplete="off" name="site" value={isca} onChange={(e) => setIsca(e.target.value)} data-testid="pub-isca" />
            {erro && <Aviso tipo="erro"><span data-testid="pub-erro">{erro}</span></Aviso>}
            <div className="pub-rodape">
              <Btn variante="fantasma" onClick={() => setEtapa(2)} data-testid={`pub-voltar-${2 - desl}`}>Voltar</Btn>
              <button type="submit" className="btn btn-primario" disabled={enviando} data-testid="pub-enviar">Pedir este horário</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function Meus({ cfg, token, setToken }) {
  const snap = useStore();
  const [aviso, setAviso] = useState('');
  const [abrirId, setAbrirId] = useState(null); // { id, modo: 'remarcar' | 'cancelar' }
  const [novo, setNovo] = useState(null);
  const lista = useMemo(() => (token ? publico.meus(token) : { ok: false }), [token, snap.state]);

  if (!lista.ok) return <Entrar setToken={setToken} />;
  const sair = () => { setToken(''); setAbrirId(null); };
  const cancelar = (id) => { const r = publico.cancelar(token, id); setAviso(r.ok ? 'Horário cancelado.' : r.erros[0]); setAbrirId(null); };
  const remarcar = (id) => { const r = publico.remarcar(token, id, novo.inicio); if (r.ok) { setAviso(`Horário remarcado. ${cfg.nome} vai confirmar o novo horário.`); setAbrirId(null); setNovo(null); } else setAviso(r.erros[0]); };
  const lembrete = (quer) => { const r = publico.lembretes(token, quer); setAviso(r.ok ? (quer ? 'Lembretes ligados.' : 'Lembretes desligados.') : r.erros[0]); };

  return (
    <section className="pub-cartao" data-testid="pub-meus">
      <div className="pub-meus-topo"><h2>Olá, {lista.nome}</h2><button type="button" className="link" onClick={sair} data-testid="pub-sair">Sair deste aparelho</button></div>
      <label className="pub-check"><input type="checkbox" checked={lista.lembretes === true} onChange={(e) => lembrete(e.target.checked)} data-testid="pub-lembretes-check" /> Receber lembretes 24 h e 2 h antes do horário</label>
      {aviso && <Aviso tipo={/cancelado|remarcado|ligados|desligados/.test(aviso) ? 'info' : 'erro'}><span data-testid="pub-aviso">{aviso}</span></Aviso>}
      <h3>Próximos horários</h3>
      {!lista.futuros.length && <p className="muted" data-testid="pub-sem-futuros">Você não tem horários marcados.</p>}
      <ul className="pub-ags">
        {lista.futuros.map((a) => (
          <li key={a.id} className="pub-ag" data-testid={`pub-ag-${a.id}`}>
            <div className="pub-ag-topo">
              <div><b>{fmtDayLong(a.inicio)}, {fmtHM(a.inicio)}</b><br /><span className="muted">{a.servicos.join(', ')} · {a.profissional}</span>{a.veiculo && <><br /><span className="muted" data-testid={`pub-veiculo-${a.id}`}><Icon n="car" size={13} /> {veiculoTxt(a.veiculo)}</span></>}{a.retirada && <><br /><span className="muted">Retirada prevista: {fmtDayLong(a.retirada)}, {fmtHM(a.retirada)}</span></>}</div>
              <span className={`chip ${a.pronto ? 'st-turquesa' : a.status === 'confirmado' ? 'st-azul' : 'st-roxo'}`}><i className="ponto" />{a.pronto ? 'Pronto para retirada' : a.rotulo}</span>
            </div>
            {abrirId?.id !== a.id && (
              <div className="pub-linha">
                <Btn tamanho="sm" icone="repeat" onClick={() => { setAbrirId({ id: a.id, modo: 'remarcar' }); setNovo(null); setAviso(''); }} data-testid={`pub-remarcar-${a.id}`}>Reagendar</Btn>
                <Btn tamanho="sm" variante="perigo" onClick={() => { setAbrirId({ id: a.id, modo: 'cancelar' }); setAviso(''); }} data-testid={`pub-cancelar-${a.id}`}>Cancelar</Btn>
              </div>
            )}
            {abrirId?.id === a.id && abrirId.modo === 'cancelar' && (
              <div className="pub-confirma">
                {a.podeCancelar
                  ? <><p>Cancelar este horário?</p><div className="pub-linha"><Btn tamanho="sm" variante="perigo" onClick={() => cancelar(a.id)} data-testid={`pub-cancelar-sim-${a.id}`}>Sim, cancelar</Btn><Btn tamanho="sm" onClick={() => setAbrirId(null)}>Voltar</Btn></div></>
                  : <><Aviso tipo="erro">Faltam menos de 24 horas, então não dá para cancelar por aqui. Fale com {cfg.nome}{cfg.telefone ? `: ${cfg.telefone}` : ''}.</Aviso><Btn tamanho="sm" onClick={() => setAbrirId(null)}>Voltar</Btn></>}
              </div>
            )}
            {abrirId?.id === a.id && abrirId.modo === 'remarcar' && (
              <div className="pub-confirma">
                <p>Escolha o novo dia e horário</p>
                <DiaHora id="pubr" chave={a.id} diasMax={cfg.diasMax} valor={novo?.inicio}
                  obterDias={(de, n) => publico.diasParaRemarcar(token, a.id, de, n)}
                  obterHorarios={(d) => publico.horariosParaRemarcar(token, a.id, d)}
                  aoEscolher={setNovo} />
                <div className="pub-linha">
                  <Btn tamanho="sm" variante="primario" disabled={!novo} onClick={() => remarcar(a.id)} data-testid={`pub-remarcar-ok-${a.id}`}>Confirmar novo horário</Btn>
                  <Btn tamanho="sm" onClick={() => setAbrirId(null)}>Voltar</Btn>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {lista.passados.length > 0 && (
        <>
          <h3>Anteriores</h3>
          <ul className="pub-ags pub-passados">{lista.passados.map((a) => <li key={a.id} className="pub-ag"><span>{fmtDayLong(a.inicio)}, {fmtHM(a.inicio)} · {a.servicos.join(', ')}{a.veiculo ? ` · ${a.veiculo.placa}` : ''}</span><span className="muted">{a.rotulo}</span></li>)}</ul>
        </>
      )}
    </section>
  );
}

function Entrar({ setToken }) {
  const snap = useStore();
  const [tel, setTel] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const demo = MODO_DEMO && enviado ? (snap.state.mensagensCliente.find((m) => m.modeloId === 'm-codigo-acesso')?.texto || '') : '';
  const pedir = () => { setErro(''); const r = publico.pedirCodigo(tel); if (!r.ok) { setErro(r.erros[0]); return; } setEnviado(true); };
  const entrar = () => { setErro(''); const r = publico.entrar({ telefone: tel, codigo }); if (!r.ok) { setErro(r.erros[0]); return; } setToken(r.token); };
  return (
    <section className="pub-cartao" data-testid="pub-entrar">
      <h2>Ver meus agendamentos</h2>
      <p className="muted">Informe o telefone usado no agendamento. Enviamos um código de 6 dígitos pelo WhatsApp.</p>
      <Campo rotulo="Telefone"><input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(formatarTelefone(e.target.value))} maxLength={16} placeholder="(51) 99999-9999" data-testid="pub-login-tel" /></Campo>
      {!enviado && <Btn variante="primario" disabled={tel.replace(/\D/g, '').length < 10} onClick={pedir} data-testid="pub-pedir-codigo">Enviar código</Btn>}
      {enviado && (
        <>
          <p className="muted" data-testid="pub-codigo-enviado">Se o telefone tiver agendamentos, o código chega em instantes.</p>
          {demo && <Aviso tipo="info"><span data-testid="pub-codigo-demo">Demonstração: {demo}</span></Aviso>}
          <Campo rotulo="Código"><input inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoComplete="one-time-code" data-testid="pub-codigo" /></Campo>
          <div className="pub-linha">
            <Btn variante="primario" disabled={codigo.length !== 6} onClick={entrar} data-testid="pub-entrar-ok">Entrar</Btn>
            <Btn variante="fantasma" onClick={() => { setEnviado(false); setCodigo(''); }}>Trocar telefone</Btn>
          </div>
        </>
      )}
      {erro && <Aviso tipo="erro"><span data-testid="pub-erro-acesso">{erro}</span></Aviso>}
    </section>
  );
}

export default function AgendarPublico({ profissionalInicial, logado, aoVoltar }) {
  const snap = useStore();
  const cfg = useMemo(() => publico.config(), [snap.state]);
  const [aba, setAba] = useState('agendar');
  const [token, setToken] = useLocal('agendar-token', '');
  const barb = cfg.profissionais.some((b) => b.id === profissionalInicial) ? profissionalInicial : '';
  return (
    <div className="pub" data-testid="pagina-publica">
      {logado && (
        <div className="pub-banner" role="status" data-testid="pub-banner">
          <span>Você está vendo a página do cliente.</span>
          <button type="button" className="link" onClick={aoVoltar} data-testid="pub-voltar-painel">Voltar ao painel</button>
        </div>
      )}
      <Cabecalho cfg={cfg} aba={aba} setAba={setAba} />
      {!cfg.ativo
        ? <section className="pub-cartao" data-testid="pub-desligado"><h2>Agendamento indisponível</h2><p className="muted">O agendamento pelo link não está disponível agora. Fale com {cfg.nome}{cfg.telefone ? `: ${cfg.telefone}` : ''}.</p></section>
        : aba === 'agendar'
          ? <Agendar cfg={cfg} profissionalInicial={barb} token={token} setToken={setToken} irParaMeus={() => setAba('meus')} />
          : <Meus cfg={cfg} token={token} setToken={setToken} />}
      <RodapePlataforma />
    </div>
  );
}
