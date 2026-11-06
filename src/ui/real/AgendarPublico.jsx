/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Página do cliente no site real (#agendar), SEM login (5e-1): escolhe serviço e profissional, vê só horários livres, pede o horário com nome e telefone
// (cupom opcional) e acompanha ou cancela o que é dele. Fala só com `publico.*` de api-real.js (GET/POST /api/publico/*); a regra toda (horário livre,
// expediente, 24 h para cancelar, limite de 3 abertos, cupom) está no servidor. O acesso a cada horário é um token que a resposta do pedido entrega UMA vez;
// ele fica só neste aparelho (localStorage, dentro de try/catch: sem storage a página funciona, só não lembra dos horários na próxima visita).
// Remarcar entrou na 5e-2 (24 h ou mais, como cancelar). Estética (v104): primeiro o veículo (placa, modelo, porte), que define preço e duração, e o horário só existe com profissional e box livres. Código por telefone e lembretes ficam para a 5e-3.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import { useAtualizacaoAutomatica } from './atualizar.js';
import { caminhoHttps } from '../../domain/localizacao.js';
import { chavePerfil, lerPerfil, mesclarPerfil } from '../../domain/perfil-local.js';
import { adicionarReserva, lerReservas, limparReservas, removerReserva, sincronizarReservas } from '../../domain/reservas-local.js';
import React, { useEffect, useMemo, useState } from 'react';
import { planosPublico, publico } from '../../services/api-real.js';
import { fmtMoney, maiuscula1 } from '../../domain/time.js';
import { rotuloMes } from '../../domain/planos.js';
import { formatarTelefone, telefoneBrasileiro } from '../../domain/rules.js';
import { Rot, capAtiva, rot } from '../../domain/tipos.js';
import { PORTE_PADRAO, formatarPlaca, limparVeiculoComRegras, placaValida, tipoPlaca } from '../../domain/veiculos.js';
import { logoValida } from '../../domain/tema.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import { OpcoesDeTroca } from '../leve/TrocaDePlano.jsx';
import { useCaptcha } from './Captcha.jsx';
import ProfissionalPorServico from '../leve/ProfissionalPorServico.jsx';
import CombinarAgendamento, { ehParaCombinar } from '../leve/CombinarAgendamento.jsx';
import { textoDoPreco } from '../../domain/blocos.js';
import { precisaAtribuirPorServico } from '../../domain/vinculo.js';
import { TOKEN_PROFISSIONAL } from '../../domain/link-publico.js';

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
// Perfil do cliente neste navegador (domain/perfil-local.js): preenche o formulário na próxima visita. Sem storage a página funciona igual.
const lerPerfilLocal = (slug) => { try { return lerPerfil(localStorage.getItem(chavePerfil(slug))); } catch { return lerPerfil(null); } };
const gravarPerfilLocal = (slug, dados) => { try { localStorage.setItem(chavePerfil(slug), JSON.stringify(mesclarPerfil(lerPerfilLocal(slug), dados))); } catch { /* sem storage: vale só nesta visita */ } };
const diaSemana = (ts) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(ts)).replace('.', '').replace(',', '');

// Dia + horário livres: os dois vêm do servidor, que só devolve o que está livre. `fonte` ({ dias(de, n), horarios(dia) }) troca a consulta (remarcar um horário já marcado).
function DiaHora({ chave, diasMax, servicoIds, profissionalId, porte, valor, aoEscolher, fonte, duracaoTotal = 30, dia, aoMudarDia, atribuicoes }) {
  const hoje = useMemo(hojeBrasilia, []);
  const [janela, setJanela] = useState(14);
  const [dias, setDias] = useState(null);
  const [diaLocal, setDiaLocal] = useState(null);
  const diaEfetivo = dia !== undefined ? dia : diaLocal;
  const setDia = aoMudarDia || setDiaLocal;
  const [horas, setHoras] = useState(null);
  const [erro, setErro] = useState('');
  const [horaPicker, setHoraPicker] = useState('');
  const [avisoHorario, setAvisoHorario] = useState(null);
  const limite = Math.min(janela, diasMax);
  useEffect(() => {
    let vivo = true;
    setErro('');
    (async () => {
      const achados = [];
      for (let ini = 0; ini < limite; ini += 31) {
        const r = fonte ? await fonte.dias(somaDias(hoje, ini), Math.min(31, limite - ini)) : await publico.dias({ de: somaDias(hoje, ini), dias: Math.min(31, limite - ini), servicoIds, profissionalId, porte, atribuicoes });
        if (!vivo) return;
        if (!r.ok) { setErro(r.erro); setDias([]); return; }
        achados.push(...r.dias);
      }
      setDias(achados);
    })();
    return () => { vivo = false; };
  }, [chave, limite]);
  const diaAtual = dias && diaEfetivo && dias.includes(diaEfetivo) ? diaEfetivo : (dias && dias.length ? dias[0] : null);
  useEffect(() => {
    setHoraPicker('');
    setAvisoHorario(null);
    if (!diaAtual) { setHoras(null); return undefined; }
    let vivo = true;
    setHoras(null);
    (fonte ? fonte.horarios(diaAtual) : publico.horarios({ data: diaAtual, servicoIds, profissionalId, porte, atribuicoes })).then((r) => { if (!vivo) return; if (r.ok) setHoras(r.horarios); else { setErro(r.erro); setHoras([]); } });
    return () => { vivo = false; };
  }, [chave, diaAtual]);

  const calcularFim = (horaInicioStr, duracaoMin) => {
    if (!horaInicioStr || !duracaoMin) return '';
    const [h, m] = horaInicioStr.split(':').map(Number);
    const totalMin = h * 60 + m + duracaoMin;
    const hFim = Math.floor(totalMin / 60) % 24;
    const mFim = totalMin % 60;
    return `${String(hFim).padStart(2, '0')}:${String(mFim).padStart(2, '0')}`;
  };

  const slotsGrid = useMemo(() => {
    if (!horas) return [];
    const mapaHoras = new Map();
    const temposSet = new Set();
    for (const h of horas) {
      const txt = horaDe(h.inicio);
      mapaHoras.set(txt, h);
      temposSet.add(txt);
    }
    const minHora = 8;
    const maxHora = 19;
    for (let hr = minHora; hr <= maxHora; hr++) {
      for (const min of [0, 30]) {
        if (hr === maxHora && min > 0) continue;
        const strHora = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        temposSet.add(strHora);
      }
    }
    const ordenados = Array.from(temposSet).sort();
    return ordenados.map((strHora) => ({
      hora: strHora,
      livre: mapaHoras.get(strHora) || null
    }));
  }, [horas]);

  const processarHorario = (txt) => {
    setHoraPicker(txt);
    setAvisoHorario(null);
    setErro('');
    if (!txt || !/^([01]\d|2[0-3]):[0-5]\d$/.test(txt)) {
      aoEscolher(null);
      return;
    }
    const [hD, mD] = txt.split(':').map(Number);
    const minD = hD * 60 + mD;

    if (!horas || horas.length === 0) {
      aoEscolher(null);
      setAvisoHorario({
        tipo: 'vazio',
        texto: 'Não há horários disponíveis neste dia que abranjam os serviços selecionados.'
      });
      return;
    }

    const exato = horas.find((h) => horaDe(h.inicio) === txt);
    if (exato) {
      aoEscolher(exato);
      setAvisoHorario(null);
      return;
    }

    let maisProximo = null;
    let menorDiff = Infinity;
    for (const h of horas) {
      const [hH, hM] = horaDe(h.inicio).split(':').map(Number);
      const minH = hH * 60 + hM;
      const diff = Math.abs(minH - minD);
      if (diff < menorDiff) {
        menorDiff = diff;
        maisProximo = h;
      }
    }

    aoEscolher(null);
    if (maisProximo) {
      setAvisoHorario({
        tipo: 'ocupado',
        horarioSugerido: maisProximo,
        texto: `O horário ${txt} não está disponível. O mais próximo neste dia é ${horaDe(maisProximo.inicio)}.`
      });
    } else {
      setAvisoHorario({
        tipo: 'vazio',
        texto: 'Não há horários disponíveis neste dia que abranjam os serviços selecionados.'
      });
    }
  };

  const selecionarHora = (h) => {
    setHoraPicker(horaDe(h.inicio));
    setAvisoHorario(null);
    aoEscolher(h);
  };
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
      {!diaAtual && dias.length > 0 && <p className="muted pub-instrucao-dia" data-testid="pub-instrucao-dia">Selecione um dia acima para ver os horários disponíveis.</p>}
      {diaAtual && (
        <>
          <p className="pub-dia-titulo">{maiuscula1(diaLongo(new Date(`${diaAtual}T12:00:00Z`).getTime()))}</p>
          {horas === null && <p className="muted" role="status" data-testid="pub-carregando-horas">Carregando horários do dia…</p>}
          {horas && (
            <>
              {horas.length === 0 ? (
                <p className="muted" data-testid="pub-sem-vagas-dia">Não há horários disponíveis neste dia que abranjam os serviços selecionados ({duracaoTotal} min).</p>
              ) : (
                <div className="pub-grid-dia" role="grid" aria-label="Grade de horários do dia" data-testid="pub-grid-dia">
                  {slotsGrid.map((slot) => {
                    if (slot.livre) {
                      const h = slot.livre;
                      const selecionado = valor === h.inicio;
                      return (
                        <button
                          key={slot.hora}
                          type="button"
                          className={`pub-hora pub-grid-slot pub-grid-livre ${selecionado ? 'on' : ''}`}
                          aria-pressed={selecionado}
                          onClick={() => selecionarHora(h)}
                          data-testid={`pub-hora-${slot.hora.replace(':', '')}`}
                        >
                          <div className="pub-grid-slot-col-hora">
                            <strong className="pub-grid-hora-texto">{slot.hora}</strong>
                            {duracaoTotal > 0 && (
                              <small className="pub-grid-termino-texto">até {calcularFim(slot.hora, duracaoTotal)}</small>
                            )}
                          </div>
                          <div className="pub-grid-slot-conteudo">
                            <span className="pub-grid-tag-livre">
                              <Icone n="check" size={13} /> Disponível
                            </span>
                            {duracaoTotal > 0 && (
                              <span className="pub-grid-duracao-tag">{duracaoTotal} min</span>
                            )}
                          </div>
                        </button>
                      );
                    }
                    return (
                      <div
                        key={slot.hora}
                        className="pub-grid-slot pub-grid-ocupado"
                        data-testid={`pub-slot-ocupado-${slot.hora.replace(':', '')}`}
                        aria-disabled="true"
                      >
                        <div className="pub-grid-slot-col-hora">
                          <span className="pub-grid-hora-texto">{slot.hora}</span>
                        </div>
                        <div className="pub-grid-slot-conteudo">
                          <span className="pub-grid-tag-ocupado">Ocupado</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pub-timepicker" data-testid="pub-timepicker-container">
                <label htmlFor="pub-input-hora" className="pub-timepicker-rotulo">
                  <Icone n="clock" size={16} />
                  <span>Escolher horário específico:</span>
                </label>
                <div className="pub-timepicker-campo">
                  <input
                    id="pub-input-hora"
                    type="time"
                    className="pub-timepicker-input"
                    value={horaPicker}
                    onChange={(e) => processarHorario(e.target.value)}
                    data-testid="pub-time-picker"
                  />
                </div>
              </div>
              {avisoHorario && (
                <div className="pub-aviso-horario" role="status" data-testid="pub-aviso-horario">
                  <p>{avisoHorario.texto}</p>
                  {avisoHorario.horarioSugerido && (
                    <button
                      type="button"
                      className="pub-hora on"
                      onClick={() => selecionarHora(avisoHorario.horarioSugerido)}
                      data-testid="pub-usar-sugestao"
                    >
                      Usar {horaDe(avisoHorario.horarioSugerido.inicio)}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Agendar({ pagina, loja, profissionalInicial, cliente, aoCriar, irParaMeus }) {
  const usaVeiculo = capAtiva('usaVeiculo');
  const desl = usaVeiculo ? 0 : 1; // sem veículo (barbearia) a primeira etapa é o serviço
  const [etapa, setEtapa] = useState(desl);
  const perfil = useMemo(() => lerPerfilLocal(loja.slug), [loja.slug]);
  const [placa, setPlaca] = useState(perfil.placa);
  const [modelo, setModelo] = useState(perfil.modelo);
  const [marca, setMarca] = useState(perfil.marca);
  const [cor, setCor] = useState(perfil.cor);
  const [porte, setPorte] = useState(perfil.porte);
  const [srv, setSrv] = useState([]);
  const [barb, setBarb] = useState(profissionalInicial || '');
  const [dia, setDia] = useState(null);
  const [escolha, setEscolha] = useState(null);
  const [nome, setNome] = useState(() => (cliente && cliente.nome) || perfil.nome);
  const [tel, setTel] = useState(() => (cliente && cliente.telefone) || perfil.tel);
  const [cupom, setCupom] = useState('');
  const [isca, setIsca] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(null);
  const [usaPlano, setUsaPlano] = useState(false); // o telefone é de quem tem plano com corte para este horário (só sim ou não)
  const [planoRestrito, setPlanoRestrito] = useState(false); // E2: o plano do telefone restringe o link aos serviços dele e algum serviço escolhido está fora
  const [trocas, setTrocas] = useState(null); // E3: planos com mais serviços (só vêm com o aviso de cota acabada ou de restrição): { opcoes, descontoPct, whatsapp }
  const [planoEsgotado, setPlanoEsgotado] = useState(false); // E2: tem plano que cobre o serviço, mas os atendimentos do mês acabaram (o link não agenda; a equipe agenda fora do plano)
  const cap = useCaptcha(loja.captchaChave);
  const escolhidos = pagina.servicos.filter((x) => srv.includes(x.id));
  const paraCombinar = escolhidos.filter(ehParaCombinar); // F: duração indefinida; não entra no pedido nem nos horários, se combina pelo botão
  const servicos = escolhidos.filter((x) => !ehParaCombinar(x));
  const srvFix = servicos.map((x) => x.id);
  // A1: quem realiza o quê. Escolhendo o profissional, só aparecem os serviços dele; escolhendo serviços, só aparecem quem realiza todos. `servicoIds: null` = servidor antigo, sem filtro.
  const realiza = (b, sid) => !b || b.servicoIds === null || b.servicoIds === undefined || b.servicoIds.includes(sid);
  const profSel = pagina.profissionais.find((b) => b.id === barb);
  // B3: profissional vindo do link: os serviços aparecem todos; se o escolhido não for dele, ele sai e "Com quem?" lista só quem faz (aviso derivado, sem estado)
  const profDoLink = pagina.profissionais.find((b) => b.id === profissionalInicial);
  const naoFazDoLink = !!profDoLink && srvFix.some((sid) => !realiza(profDoLink, sid));
  const avisoProf = naoFazDoLink && barb !== profDoLink.id ? `${profDoLink.nome} não faz esse serviço. Escolha quem faz.` : '';
  useEffect(() => { if (profDoLink && barb === profDoLink.id && srvFix.some((sid) => !realiza(profDoLink, sid))) { setBarb(''); setEscolha(null); } }, [srvFix.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const servicosVisiveis = pagina.servicos.filter((x) => ehParaCombinar(x) || ((profSel && !(profDoLink && profSel.id === profDoLink.id)) ? realiza(profSel, x.id) : pagina.profissionais.length === 0 || pagina.profissionais.some((b) => realiza(b, x.id))));
  const profissionaisVisiveis = pagina.profissionais.filter((b) => srvFix.every((sid) => realiza(b, sid)));
  // B1: serviços feitos por pessoas diferentes → um campo de profissional por serviço (vazio e obrigatório); "Com quem?" some. Estética (box único) e escolha automática ficam como eram.
  const [atrib, setAtrib] = useState({});
  const porServicoPub = Object.fromEntries(srvFix.map((sid) => [sid, pagina.profissionais.filter((b) => realiza(b, sid)).map((b) => b.id)]));
  const precisaAtribuir = !capAtiva('usaRecursoFisico') && !pagina.profissionalAutomatico && pagina.profissionais.every((b) => Array.isArray(b.servicoIds)) && precisaAtribuirPorServico(srvFix, porServicoPub);
  useEffect(() => { setAtrib((a) => Object.fromEntries(Object.entries(a).filter(([sid, pid]) => srvFix.includes(sid) && (porServicoPub[sid] || []).includes(pid)))); }, [srvFix.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const faltaAtribuir = precisaAtribuir && srvFix.some((sid) => !atrib[sid]);
  const atribuicoes = precisaAtribuir && !faltaAtribuir ? atrib : undefined;
  const preco = (x) => (usaVeiculo ? x.precos[porte || PORTE_PADRAO] ?? x.preco : x.preco); // sem porte (dono tirou a obrigatoriedade) vale o médio
  const minutos = (x) => (usaVeiculo ? x.duracoes[porte || PORTE_PADRAO] ?? x.duracao : x.duracao);
  const total = servicos.reduce((t, x) => t + preco(x), 0);
  const duracao = servicos.reduce((t, x) => t + minutos(x), 0);
  const placaOk = placaValida(placa);
  const exV = pagina.exigeVeiculo || ['placa', 'modelo', 'porte']; // o que o dono marcou como obrigatório (Estabelecimento > Link)
  const veiculoOk = limparVeiculoComRegras({ placa, modelo, porte }, exV).ok;
  const estrela = (k) => (exV.includes(k) ? ' *' : ' (opcional)');
  const rotuloPorte = (pagina.portes || []).find((x) => x.id === porte)?.nome || '';
  const textoV = [modelo.trim(), placa && formatarPlaca(placa), rotuloPorte && `porte ${rotuloPorte.toLowerCase()}`].filter(Boolean).join(' · ');
  const chave = `${srvFix.join(',')}|${barb}|${porte}|${precisaAtribuir ? Object.entries(atrib).map(([k, v]) => `${k}:${v}`).sort().join(',') : ''}`;
  const nomeBarb = (id) => pagina.profissionais.find((b) => b.id === id)?.nome || `Qualquer ${rot('profissional')}`;
  const alternar = (id) => { setSrv((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= 5 ? l : [...l, id])); setEscolha(null); };

  useEffect(() => { setErro(''); }, [etapa]);

  // Avisa antes de pedir: "este horário usa um atendimento do seu plano". Só consulta com o telefone completo; o servidor responde apenas sim ou não.
  useEffect(() => {
    setUsaPlano(false); setPlanoEsgotado(false); setPlanoRestrito(false); setTrocas(null);
    if (etapa !== 3 || !escolha || !telefoneBrasileiro(tel)) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await planosPublico.uso({ telefone: tel, servicoIds: srvFix, inicio: escolha.inicio });
      if (vivo && r.ok && r.usaPlano) setUsaPlano(true);
      if (vivo && r.ok && r.esgotado) setPlanoEsgotado(true);
      if (vivo && r.ok && r.restrito) setPlanoRestrito(true);
      if (vivo && r.ok && (r.esgotado || r.restrito) && Array.isArray(r.trocas) && r.trocas.length) setTrocas({ opcoes: r.trocas, descontoPct: r.descontoTrocaPct || 0, whatsapp: r.whatsapp || '' });
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [etapa, tel, srvFix.join(','), escolha]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    if (enviando) return;
    setErro('');
    if (pagina.exigeNome !== false && (!nome || nome.trim().length < 2)) {
      setErro('Informe o seu nome.');
      return;
    }
    const semTelefone = !pagina.exigeTelefone && String(tel ?? '').replace(/\D/g, '') === '';
    if (!semTelefone && !telefoneBrasileiro(tel)) {
      setErro('Informe o telefone com DDD.');
      return;
    }
    setEnviando(true);
    const r = await publico.agendar({ nome, telefone: tel, servicoIds: srvFix, profissionalId: escolha?.profissionalId || barb, ...(atribuicoes ? { atribuicoes } : {}), inicio: escolha?.inicio, cupomChave: cupom, site: isca, selo: pagina.selo, captcha: cap.prova, ...(usaVeiculo ? { veiculo: { placa, marca, modelo, cor, porte } } : {}) });
    cap.gasta();
    setEnviando(false);
    if (r.ok) gravarPerfilLocal(loja.slug, { nome, tel, ...(usaVeiculo ? { placa, modelo, marca, cor, porte } : {}) });
    if (!r.ok) {
      cap.verificar(r);
      if (r.status === 409 && /ocupado/.test(r.erro)) {
        setEscolha(null);
        setEtapa(2);
        setTimeout(() => setErro(r.erro), 10);
      } else {
        setErro(r.erro);
      }
      return;
    }
    if (r.token) aoCriar({ id: r.agendamento.id, token: r.token }, { id: r.agendamento.id, inicio: r.agendamento.inicio, fim: r.agendamento.fim, servicos: r.agendamento.servicos, profissional: r.agendamento.profissional }, { nome, telefone: tel });
    for (const o of r.outros || []) if (o.token) aoCriar({ id: o.agendamento.id, token: o.token }, { id: o.agendamento.id, inicio: o.agendamento.inicio, fim: o.agendamento.fim, servicos: o.agendamento.servicos, profissional: o.agendamento.profissional }, { nome, telefone: tel });
    setFeito({ ...r.agendamento, combinar: paraCombinar, partes: (r.outros || []).map((o) => o.agendamento), usouPlano: r.usouPlano === true, plano: r.plano || null });
    setEtapa(4);
  };
  const recomecar = () => { setEtapa(desl); setSrv([]); setEscolha(null); setFeito(null); setCupom(''); setErro(''); };

  if (etapa === 4 && feito) {
    return (
      <section className="pub-cartao" data-testid="pub-feito" aria-live="polite">
        <div className="pub-ok"><Icone n="check" size={26} /></div>
        <h2>Pedido enviado</h2>
        {feito.partes && feito.partes.length > 0
          ? <ul className="pub-partes" data-testid="pub-feito-partes">{[feito, ...feito.partes].map((x) => <li key={x.id}>{x.servicos.join(', ')} com <b>{x.profissional}</b> · <b>{diaLongo(x.inicio)}, {horaDe(x.inicio)}</b></li>)}</ul>
          : <p>{feito.servicos.join(', ')}{feito.veiculo ? ` · ${feito.veiculo.modelo} ${formatarPlaca(feito.veiculo.placa)}` : ''} com <b>{feito.profissional}</b><br /><b>{diaLongo(feito.inicio)}, {horaDe(feito.inicio)}</b></p>}
        {feito.combinar && feito.combinar.length > 0 && <CombinarAgendamento servicos={feito.combinar} nomeCliente={nome} aviso={`Falta combinar o horário de ${feito.combinar.map((x) => x.nome).join(', ')} com a loja.`} />}
        {feito.usouPlano && <p data-testid="pub-feito-plano"><Icone n="ticket" size={14} /> Este horário usa um atendimento do seu plano.</p>}
        {feito.plano && <p data-testid="pub-feito-plano-restam">{feito.plano.restantes > 0 ? `Restam ${feito.plano.restantes} atendimento${feito.plano.restantes === 1 ? '' : 's'} do seu plano em ${rotuloMes(feito.plano.mes)}.` : `Este foi o último atendimento do seu plano em ${rotuloMes(feito.plano.mes)}.`}</p>}
        {feito.desconto > 0 && <p data-testid="pub-feito-cupom"><Icone n="key" size={14} /> Cupom {feito.cupom}: −{fmtMoney(feito.desconto)} · a pagar {fmtMoney(feito.total - feito.desconto)}</p>}
        <p className="muted">{loja.nome} vai confirmar o seu horário. Você acompanha em “Meus agendamentos” neste aparelho.</p>
        <p className="muted" data-testid="pub-feito-avaliar">Depois do atendimento você poderá avaliar por aqui, em Meus agendamentos.</p>
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
        {['Veículo', 'Serviço', 'Dia e horário', 'Seus dados'].slice(desl).map((r, k) => { const i = k + desl; return <li key={r} className={i === etapa ? 'on' : i < etapa ? 'feito' : ''} aria-current={i === etapa ? 'step' : undefined}><span>{k + 1}</span>{r}</li>; })}
      </ol>

      {etapa === 0 && usaVeiculo && (
        <div className="pub-bloco">
          <h2>Qual é o seu veículo?</h2>
          <p className="muted">O porte define o preço e o tempo de cada serviço.</p>
          <div className="pub-form">
            <Campo rotulo={`Placa (ABC-1234 ou ABC1D23)${estrela('placa')}`}>
              <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8))} maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder="ABC1D23" aria-invalid={!!placa && !placaOk} data-testid="pub-placa" />
            </Campo>
            {placa && !placaOk && <p className="erro-txt" role="alert" data-testid="pub-placa-erro">Placa inválida.</p>}
            <Campo rotulo={`Modelo${estrela('modelo')}`}><input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={40} placeholder="Ex.: Onix, Corolla, Hilux" autoComplete="off" data-testid="pub-modelo" /></Campo>
            <div className="pub-duas">
              <Campo rotulo="Marca (opcional)"><input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={30} autoComplete="off" data-testid="pub-marca" /></Campo>
              <Campo rotulo="Cor (opcional)"><input value={cor} onChange={(e) => setCor(e.target.value)} maxLength={20} autoComplete="off" data-testid="pub-cor" /></Campo>
            </div>
            <div className="campo"><span className="campo-rotulo" id="pub-porte-r">{`Porte${estrela('porte')}`}</span>
              <div className="pub-portes" role="group" aria-labelledby="pub-porte-r">
                {(pagina.portes || []).map((x) => (
                  <button type="button" key={x.id} className={`pub-porte ${porte === x.id ? 'on' : ''}`} aria-pressed={porte === x.id} onClick={() => { setPorte(x.id); setEscolha(null); }} data-testid={`pub-porte-${x.id}`}>
                    <b>{x.nome}</b><small>{(x.exemplo || '').replace('Ex.: ', '')}</small>
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
          {usaVeiculo && <p className="muted" data-testid="pub-veiculo-atual">{textoV || 'Sem dados do veículo'} <button type="button" className="link" onClick={() => { setErro(''); setEtapa(0); }} data-testid="pub-trocar-veiculo">Trocar</button></p>}
          {!pagina.servicos.length && <p className="muted" data-testid="pub-sem-servicos">Nenhum serviço disponível para agendar por aqui. Fale com a loja.</p>}
          <div className="pub-lista">
            {servicosVisiveis.map((x) => (
              <label key={x.id} className={`pub-item ${srv.includes(x.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={srv.includes(x.id)} onChange={() => alternar(x.id)} data-testid={`pub-srv-${x.id}`} />
                <span className="pub-item-txt"><b>{x.nome}</b><small className="muted">{x.combinar ? (x.combinar.duracaoTexto || 'Duração a combinar') : fmtDur(minutos(x))}{x.antecedenciaH > 0 ? ` · agende com ${x.antecedenciaH} h de antecedência` : ''}</small></span>
                <span className="pub-preco">{x.combinar ? textoDoPreco({ preco: x.preco, precoModo: x.combinar.precoModo, precoMax: x.combinar.precoMax, precoOpcoes: x.combinar.opcoes }, fmtMoney) : fmtMoney(preco(x))}</span>
              </label>
            ))}
          </div>
          {paraCombinar.length > 0 && <CombinarAgendamento servicos={paraCombinar} nomeCliente={nome} aviso={srvFix.length ? 'Estes serviços não têm horário na grade: combine com a loja. Os demais você agenda pelos horários abaixo.' : 'Este serviço não tem horário na grade: combine com a loja.'} />}
          {precisaAtribuir && <ProfissionalPorServico testid="pub-pps" servicos={servicos.map((x) => ({ id: x.id, nome: x.nome }))} rotuloProfissional={Rot('profissional')} opcoes={(sid) => pagina.profissionais.filter((b) => realiza(b, sid)).map((b) => ({ id: b.id, nome: b.nome }))} valor={atrib} aoMudar={(v) => { setAtrib(v); setEscolha(null); }} />}
          {!precisaAtribuir && avisoProf && <p className="muted" role="status" data-testid="pub-aviso-prof">{avisoProf}</p>}
          {(srvFix.length > 0 || !srv.length) && !precisaAtribuir && !(pagina.profissionalAutomatico && !barb) && <>
          <h3>Com quem?</h3>
          <div className="pub-barbs" role="group" aria-label={Rot('profissional')}>
            <button type="button" className={`pub-barb ${barb === '' ? 'on' : ''}`} aria-pressed={barb === ''} onClick={() => { setBarb(''); setEscolha(null); }} data-testid="pub-barb-qualquer">Qualquer um</button>
            {profissionaisVisiveis.map((b) => <button type="button" key={b.id} className={`pub-barb ${barb === b.id ? 'on' : ''}`} aria-pressed={barb === b.id} onClick={() => { setBarb(b.id); setEscolha(null); }} data-testid={`pub-barb-${b.id}`}>{b.nome}</button>)}
          </div>
          </>}
          <div className="pub-rodape">
            {servicos.length > 0 && <span className="muted" data-testid="pub-total">{fmtDur(duracao)} · {fmtMoney(total)}</span>}
            {usaVeiculo && <Btn variante="fantasma" onClick={() => { setErro(''); setEtapa(0); }} data-testid="pub-voltar-0">Voltar</Btn>}
            {(srvFix.length > 0 || !srv.length) && <Btn variante="primario" disabled={!srvFix.length || faltaAtribuir} onClick={() => setEtapa(2)} data-testid="pub-continuar-1">Escolher horário</Btn>}
          </div>
        </div>
      )}

      {etapa === 2 && (
        <div className="pub-bloco">
          <h2>Quando?</h2>
          <p className="muted">Só aparecem horários livres. Toque no dia e no horário.</p>
          <DiaHora chave={chave} diasMax={pagina.diasMax} servicoIds={srvFix} profissionalId={precisaAtribuir ? '' : barb} atribuicoes={atribuicoes} porte={usaVeiculo ? porte : undefined} valor={escolha?.inicio} aoEscolher={setEscolha} duracaoTotal={duracao} dia={dia} aoMudarDia={setDia} />
          {erro && <Aviso tipo="erro"><span data-testid="pub-erro">{erro}</span></Aviso>}
          <div className="pub-rodape">
            <Btn variante="fantasma" onClick={() => { setErro(''); setEtapa(1); }} data-testid={`pub-voltar-${1 - desl}`}>Voltar</Btn>
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
            <span>{diaLongo(escolha.inicio)}, {horaDe(escolha.inicio)} · {nomeBarb(escolha.profissionalId)}</span>
            <span className="muted">{fmtDur(duracao)} · {fmtMoney(total)}</span>
            {paraCombinar.length > 0 && <span className="muted" data-testid="pub-resumo-combinar">Falta combinar com a loja: {paraCombinar.map((x) => x.nome).join(', ')}.</span>}
          </div>
          <form className="pub-form" onSubmit={(e) => { e.preventDefault(); enviar(); }} noValidate>
            <Campo rotulo={pagina.exigeNome === false ? 'Nome (opcional)' : 'Nome'}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="name" data-testid="pub-nome" /></Campo>
            <Campo rotulo={pagina.exigeTelefone ? 'Telefone (WhatsApp, com DDD)' : 'Telefone (WhatsApp) (opcional)'} dica={pagina.exigeTelefone ? undefined : 'Opcional, se quiser. Com telefone a loja avisa do seu horário; sem ele, só vê o seu pedido.'}><input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(formatarTelefone(e.target.value))} maxLength={16} autoComplete="tel" placeholder="(51) 99999-9999" data-testid="pub-tel" /></Campo>
            {usaPlano && <p className="pub-aviso-plano" role="status" data-testid="pub-usa-plano"><Icone n="ticket" size={14} /> Este horário usa um atendimento do seu plano.</p>}
            {planoRestrito && <p className="pub-aviso-plano esgotado" role="status" data-testid="pub-plano-restrito"><Icone n="ticket" size={14} /> Seu plano permite agendar pelo link só os serviços dele. Para outros serviços, fale com a equipe.</p>}
            {planoEsgotado && <p className="pub-aviso-plano esgotado" role="status" data-testid="pub-plano-esgotado"><Icone n="ticket" size={14} /> Os atendimentos do seu plano neste mês acabaram. Para agendar fora do plano, fale com a equipe.</p>}
            {trocas && <OpcoesDeTroca opcoes={trocas.opcoes} descontoPct={trocas.descontoPct} whatsapp={trocas.whatsapp} telefone={tel} aoPedir={(o) => planosPublico.pedirTroca({ telefone: tel, planoId: o.planoId, site: isca })} />}
            <Campo rotulo="Cupom (opcional)"><input value={cupom} onChange={(e) => setCupom(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14))} maxLength={14} autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX" data-testid="pub-cupom" /></Campo>
            <input className="pub-isca" tabIndex={-1} aria-hidden="true" autoComplete="off" name="site" value={isca} onChange={(e) => setIsca(e.target.value)} data-testid="pub-isca" />
            {erro && <Aviso tipo="erro"><span data-testid="pub-erro">{erro}</span></Aviso>}
            {cap.widget}
            <div className="pub-rodape">
              <Btn variante="fantasma" onClick={() => { setErro(''); setEtapa(2); }} data-testid={`pub-voltar-${2 - desl}`}>Voltar</Btn>
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
  const [pendenteMeus, setPendenteMeus] = useState(false);
  const cap = useCaptcha(loja.captchaChave);
  const tokens = acessos.map((a) => a.token).join(',');
  const recarregarMeus = () => {
    if (!acessos.length) return;
    publico.meus(acessos.map((a) => a.token)).then((r) => {
      if (!r || !r.ok) return; // falha de fundo nao mostra erro
      setLista(r.agendamentos);
      if (typeof aoSincronizar === 'function') aoSincronizar(r.agendamentos);
      const ids = new Set(r.agendamentos.map((a) => a.id));
      if (acessos.some((a) => !ids.has(a.id))) {
        const novos = acessos.filter((a) => ids.has(a.id));
        gravarAcessos(loja.slug, novos);
        setAcessos(novos);
      }
    }).catch(() => {});
  };
  useAtualizacaoAutomatica(recarregarMeus, 60000);
  const abrirAvaliacao = async (a) => {
    const ac = acessos.find((x) => x.id === a.id);
    if (!ac) return;
    if (typeof publico.obterTokenAvaliacao === 'function') {
      const r = await publico.obterTokenAvaliacao(a.id, ac.token);
      if (r && r.ok && r.avaliarToken) {
        window.location.hash = '#avaliar/' + r.avaliarToken;
        return;
      }
    }
    if (typeof publico.avaliarAgendamento === 'function') {
      const r = await publico.avaliarAgendamento(a.id, ac.token);
      if (r && r.ok && r.avaliarToken) {
        window.location.hash = '#avaliar/' + r.avaliarToken;
        return;
      }
    }
    window.location.hash = '#avaliar/' + ac.token;
  };
  const consultarMeus = (prova) => {
    let vivo = true;
    if (!acessos.length) { setLista([]); return () => {}; }
    publico.meus(acessos.map((a) => a.token), prova).then((r) => {
      if (prova) cap.gasta();
      if (!vivo) return;
      if (!r.ok) {
        if (cap.verificar(r)) setPendenteMeus(true);
        setErro(r.erro);
        setLista([]);
        return;
      }
      setPendenteMeus(false);
      setErro(''); setLista(r.agendamentos); aoSincronizar(r.agendamentos);
      const ids = new Set(r.agendamentos.map((a) => a.id));
      if (acessos.some((a) => !ids.has(a.id))) { const novos = acessos.filter((a) => ids.has(a.id)); gravarAcessos(loja.slug, novos); setAcessos(novos); } // acesso vencido some do aparelho
    });
    return () => { vivo = false; };
  };
  useEffect(() => consultarMeus(''), [tokens]);
  useEffect(() => { if (pendenteMeus && cap.prova) return consultarMeus(cap.prova); return undefined; }, [pendenteMeus, cap.prova]);
  if (lista === null) return <section className="pub-cartao"><p className="muted" role="status">Carregando…</p></section>;
  const futuros = lista.filter((a) => a.ativo);
  const passados = lista.filter((a) => !a.ativo).sort((a, b) => b.inicio - a.inicio);
  const cancelar = async (a) => {
    const acesso = acessos.find((x) => x.id === a.id);
    setConfirmando(null); setAviso(''); setErro('');
    const r = await publico.cancelar(a.id, acesso ? acesso.token : '', cap.prova);
    cap.gasta();
    if (!r.ok) { cap.verificar(r); setErro(r.erro); return; }
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
    const r = await publico.remarcar(a.id, acesso ? acesso.token : '', remarcando.escolha.inicio, cap.prova);
    cap.gasta();
    setEnviando(false);
    if (!r.ok) { cap.verificar(r); setErro(r.erro); return; }
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
      {cap.widget}
      <h3>Próximos horários</h3>
      {!futuros.length && <p className="muted" data-testid="pub-sem-futuros">Você não tem horários marcados neste aparelho.</p>}
      <ul className="pub-ags">
        {futuros.map((a) => (
          <li key={a.id} className="pub-ag" data-testid={`pub-ag-${a.id}`}>
            <div className="pub-ag-topo">
              <div><b>{diaLongo(a.inicio)}, {horaDe(a.inicio)}</b><br /><span className="muted">{a.servicos.join(', ')}{a.veiculo ? ` · ${a.veiculo.modelo} ${formatarPlaca(a.veiculo.placa)}` : ''} · {a.profissional}</span>
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
                      <DiaHora chave={`r-${a.id}-${a.inicio}`} diasMax={diasMax} fonte={fonteDe(a)} valor={remarcando.escolha?.inicio} aoEscolher={(h) => setRemarcando({ id: a.id, escolha: h })} duracaoTotal={a.duracao || 30} />
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
          <ul className="pub-ags pub-passados">{passados.map((a) => (
            <li key={a.id} className="pub-ag" data-testid={`pub-ag-${a.id}`}>
              <div className="pub-ag-topo">
                <div><span>{diaLongo(a.inicio)}, {horaDe(a.inicio)} · {a.servicos.join(', ')}</span></div>
                <span className="muted">{a.rotulo}</span>
              </div>
              {a.status === 'concluido' && !a.avaliado && !a.avaliacao && (
                <div className="pub-linha pub-avaliar-bloco" data-testid={`pub-avaliar-${a.id}`} style={{ marginTop: '0.5rem' }}>
                  <span>Seu atendimento foi concluído. Conte como foi</span>
                  <Btn tamanho="sm" variante="primario" onClick={() => abrirAvaliacao(a)} data-testid={`pub-avaliar-btn-${a.id}`}>Avaliar</Btn>
                </div>
              )}
            </li>
          ))}</ul>
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
  const esquecer = () => { atualizarReservas(() => limparReservas(null, Date.now())); try { localStorage.removeItem(chavePerfil(loja.slug)); } catch { /* sem storage */ } };
  // B3: o trecho do link pode ser um token assinado (o servidor confere; inválido/vencido/de outra loja = ignorado, sem aviso) ou o id cru de links antigos. null = ainda conferindo.
  const [profLink, setProfLink] = useState(() => (TOKEN_PROFISSIONAL.test(profissionalInicial || '') ? null : (profissionalInicial || '')));
  useEffect(() => {
    if (!TOKEN_PROFISSIONAL.test(profissionalInicial || '')) { setProfLink(profissionalInicial || ''); return undefined; }
    let vivo = true;
    setProfLink(null);
    publico.linkProfissional(profissionalInicial).then((r) => { if (vivo) setProfLink(r.profissionalId || ''); });
    return () => { vivo = false; };
  }, [profissionalInicial]);
  const barb = pagina && profLink && pagina.profissionais.some((b) => b.id === profLink) ? profLink : '';
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
            {aba === 'agendar' && profLink === null
              ? <p className="muted" role="status" data-testid="pub-carregando-link">Carregando…</p>
              : aba === 'agendar'
              ? <Agendar pagina={pagina} loja={loja} profissionalInicial={barb} cliente={reservas.cliente} aoCriar={guardar} irParaMeus={() => setAba('meus')} />
              : <Meus loja={loja} acessos={acessos} setAcessos={setAcessos} diasMax={pagina.diasMax} aoSincronizar={sincronizar} />}
          </div>
        </div>
      )}
      <p className="rodape-plataforma">Agendz</p>
    </div>
  );
}
