/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ausência do profissional (bloco A3). A MESMA janela no site real e na demonstração: quem usa passa `carregar` e `criar` (a API de cada lado). Abre pelo botão "Ausência" da aba Calendário da Agenda; aberta pelo botão "Ausência" da aba Calendário da Agenda. Baseada na etapa "Dia e horário" do #agendar,
// MAS sem a regra de deixar horário vago: mostra TODO o expediente da pessoa que ainda está livre e deixa marcar quantos horários forem precisos, só clicando.
// Horário marcado tem borda azul e um X no canto superior direito (desmarca). Segurar o dia bloqueia o dia inteiro; com um dia marcado, tocar em outros dias os acrescenta;
// o dia marcado mostra um X no topo (desmarca). O servidor decide: recusa se já há agendamento no período e lista os conflitos (mensagem dele).
// Não importa `api.js`, `api-real.js`, `hooks.js` nem `common.jsx`: é apresentação (tests/estatico.test.mjs).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DIAS_CURTOS, MIN, addDays, fmtDayLong, fmtHM, maiuscula1, startOfDay, ymd } from '../../domain/time.js';
import { Aviso, Btn, Icone } from './mini.jsx';
import { useToqueLongo } from './segurar.js';

const PASSO = 30; // minutos por horário da grade
const JANELA = 14; // dias mostrados de cada vez
const MAX_DIAS = 90;

/** Faixas (em minutos) em que a pessoa trabalha num dia da semana: as dela, ou as da loja se ela não tem escala própria. Loja sem expediente: 08:00–19:00 (não restringe). */
export function faixasDaPessoa(lojaDias, pessoaDias, dow) {
  const propria = pessoaDias && Object.values(pessoaDias).some((d) => d.aberto);
  const dias = propria ? pessoaDias : lojaDias;
  const lojaTem = lojaDias && Object.values(lojaDias).some((d) => d.aberto);
  if (!propria && !lojaTem) return [[8 * 60, 19 * 60]];
  const dia = dias && dias[dow];
  if (!dia || !dia.aberto) return [];
  const m = (t) => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
  return dia.faixas.map(([a, b]) => [m(a), m(b)]);
}

/** Horários de PASSO minutos do dia (início em ms) dentro das faixas; os que já passaram, os ocupados e os já ausentes vêm marcados. */
export function gradeDoDia(diaTs, faixas, ocupados, agora) {
  const saida = [];
  for (const [ini, fim] of faixas) {
    for (let t = ini; t + PASSO <= fim; t += PASSO) {
      const a = diaTs + t * MIN;
      const b = a + PASSO * MIN;
      const bloqueio = ocupados.find((o) => o.ini < b && o.fim > a);
      saida.push({ inicio: a, fim: b, passado: b <= agora, ocupado: bloqueio ? bloqueio.tipo : null });
    }
  }
  return saida;
}

/** Junta horários marcados que se encostam em intervalos únicos [{ini, fim}] (ms). */
export function juntarHorarios(inicios) {
  const ord = [...new Set(inicios)].sort((x, y) => x - y);
  const saida = [];
  for (const i of ord) {
    const ult = saida[saida.length - 1];
    if (ult && ult.fim === i) ult.fim = i + PASSO * MIN;
    else saida.push({ ini: i, fim: i + PASSO * MIN });
  }
  return saida;
}

function BotaoDia({ ts, ativo, marcado, aoClicar, aoSegurar, aoDesmarcar }) {
  const toque = useToqueLongo(aoSegurar);
  const d = new Date(ts);
  return (
    <div className={`aus-celula${marcado ? ' marcado' : ''}`}>
      <button type="button" className={`pub-dia aus-dia ${ativo ? 'on' : ''}${marcado ? ' aus-dia-marcado' : ''}`} aria-pressed={ativo || marcado} onClick={aoClicar} {...toque} data-testid={`aus-dia-${ymd(ts)}`}>
        <small>{DIAS_CURTOS[d.getDay()]}</small><b>{d.getDate()}</b><small>{String(d.getMonth() + 1).padStart(2, '0')}</small>
      </button>
      {marcado && <button type="button" className="aus-x aus-x-dia" aria-label={`Desmarcar o dia ${d.getDate()}/${d.getMonth() + 1}`} onClick={aoDesmarcar} data-testid={`aus-dia-x-${ymd(ts)}`}>×</button>}
    </div>
  );
}

// carregar(profId, de, ate) → Promise<{ loja: dias|{}, pessoa: dias|{}, agenda: [{inicio, fim, fimOcupado}], existentes: [{ini, fim}] }>   |   criar(profId, intervalos) → Promise<{ ok, erro, ausencias }>
export default function AusenciaForm({ profissionais, meuId, ehProprio, carregar, criar, aoSalvar, aoFechar }) {
  const agora = useMemo(() => Date.now(), []);
  const hoje = useMemo(() => startOfDay(agora), [agora]);
  const [profId, setProfId] = useState(() => (profissionais.some((p) => p.id === meuId) ? meuId : (profissionais[0] || {}).id || ''));
  const [janela, setJanela] = useState(JANELA);
  const [diaAtivo, setDiaAtivo] = useState(hoje);
  const [horarios, setHorarios] = useState(() => new Set()); // inícios (ms) marcados
  const [diasInteiros, setDiasInteiros] = useState(() => new Set()); // 'AAAA-MM-DD' bloqueados por inteiro
  const [loja, setLoja] = useState(null);
  const [pessoa, setPessoa] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [existentes, setExistentes] = useState([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const raiz = useRef(null);
  useEffect(() => { raiz.current?.focus(); }, []);
  // Escape fecha mesmo que o foco tenha se perdido (tocar no X de um horário remove o botão que estava em foco)
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') aoFechar(); }; document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f); }, [aoFechar]);
  useEffect(() => { setErro(''); }, [diaAtivo, profId]); // erro de um passo não vaza para o outro (regra de wizards)

  useEffect(() => {
    if (!profId) return undefined;
    let vivo = true;
    setLoja(null); setPessoa(null); setHorarios(new Set());
    carregar(profId, hoje, addDays(hoje, MAX_DIAS + 2)).then((r) => { if (!vivo) return; setLoja(r.loja || {}); setPessoa(r.pessoa || {}); setAgenda(r.agenda || []); setExistentes(r.existentes || []); });
    return () => { vivo = false; };
  }, [profId, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  const dias = useMemo(() => Array.from({ length: Math.min(janela, MAX_DIAS) }, (_, i) => addDays(hoje, i)), [hoje, janela]);
  const carregando = loja === null || pessoa === null;
  const ocupados = useMemo(() => [
    ...agenda.map((a) => ({ ini: a.inicio, fim: a.fimOcupado || a.fim || a.inicio, tipo: 'ocupado' })),
    ...existentes.map((x) => ({ ini: x.ini, fim: x.fim, tipo: 'ausente' })),
  ], [agenda, existentes]);
  const grade = useMemo(() => (carregando ? [] : gradeDoDia(diaAtivo, faixasDaPessoa(loja, pessoa, new Date(diaAtivo).getDay()), ocupados, agora)), [carregando, loja, pessoa, diaAtivo, ocupados, agora]);
  const diaBloqueado = diasInteiros.has(ymd(diaAtivo));

  const alternarDia = (ts) => setDiasInteiros((s) => { const n = new Set(s); const k = ymd(ts); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const clicarDia = (ts) => { if (diasInteiros.size > 0) alternarDia(ts); setDiaAtivo(ts); };
  const alternarHora = (inicio) => setHorarios((s) => { const n = new Set(s); if (n.has(inicio)) n.delete(inicio); else n.add(inicio); return n; });

  const total = horarios.size + diasInteiros.size;
  const salvar = async () => {
    if (enviando) return;
    if (!profId) { setErro('Escolha a pessoa que vai se ausentar.'); return; }
    if (total === 0) { setErro('Marque ao menos um horário ou um dia.'); return; }
    setEnviando(true); setErro('');
    const soltos = [...horarios].filter((h) => !diasInteiros.has(ymd(h)));
    const intervalos = [...[...diasInteiros].map((dia) => ({ dia })), ...juntarHorarios(soltos)];
    const r = await criar(profId, intervalos);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.ausencias ? r.ausencias.length : 1);
  };

  return (
    <div ref={raiz} tabIndex={-1} className="cartao-detalhe detalhe-modal-real aus-janela" data-testid="aus-janela">
      <div className="detalhe-topo-real"><h3>Ausência</h3><button type="button" className="btn" aria-label="Fechar" onClick={aoFechar} data-testid="aus-fechar">×</button></div>
      <p className="muted">Marque os horários em que a pessoa não pode receber clientes. Segure um dia para bloquear o dia inteiro.</p>
      {!ehProprio && profissionais.length > 1 && (
        <label className="campo"><span className="campo-rotulo">Quem se ausenta</span>
          <select value={profId} onChange={(e) => { setProfId(e.target.value); setDiasInteiros(new Set()); }} data-testid="aus-profissional">
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      )}
      <div className="pub-dias aus-dias" role="group" aria-label="Escolher o dia" data-testid="aus-dias">
        {dias.map((ts) => <BotaoDia key={ts} ts={ts} ativo={ts === diaAtivo} marcado={diasInteiros.has(ymd(ts))} aoClicar={() => clicarDia(ts)} aoSegurar={() => { alternarDia(ts); setDiaAtivo(ts); }} aoDesmarcar={() => alternarDia(ts)} />)}
        {janela < MAX_DIAS && <button type="button" className="pub-dia pub-mais" onClick={() => setJanela((j) => Math.min(j + JANELA, MAX_DIAS))} data-testid="aus-mais-dias"><Icone n="plus" size={16} /><small>Mais dias</small></button>}
      </div>
      <p className="pub-dia-titulo">{maiuscula1(fmtDayLong(diaAtivo))}</p>
      {carregando && <p className="muted" role="status" data-testid="aus-carregando">Carregando o expediente…</p>}
      {!carregando && diaBloqueado && <Aviso data-testid="aus-dia-inteiro">Dia inteiro bloqueado. Toque no X do dia para desmarcar.</Aviso>}
      {!carregando && !diaBloqueado && grade.length === 0 && <p className="muted" data-testid="aus-sem-expediente">Essa pessoa não trabalha neste dia.</p>}
      {!carregando && !diaBloqueado && grade.length > 0 && (
        <div className="pub-grid-dia aus-grade" role="group" aria-label="Horários do dia" data-testid="aus-grade">
          {grade.map((h) => {
            const hm = fmtHM(h.inicio).replace(':', '');
            const marcado = horarios.has(h.inicio);
            if (h.passado || h.ocupado) {
              return (
                <div key={h.inicio} className="pub-grid-slot pub-grid-ocupado" aria-disabled="true" data-testid={`aus-slot-bloqueado-${hm}`}>
                  <div className="pub-grid-slot-col-hora"><span className="pub-grid-hora-texto">{fmtHM(h.inicio)}</span></div>
                  <div className="pub-grid-slot-conteudo"><span className="pub-grid-tag-ocupado">{h.passado ? 'Passou' : h.ocupado === 'ausente' ? 'Ausente' : 'Ocupado'}</span></div>
                </div>
              );
            }
            return (
              <div key={h.inicio} className={`aus-celula aus-celula-hora${marcado ? ' marcado' : ''}`}>
                <button type="button" className={`pub-hora pub-grid-slot pub-grid-livre ${marcado ? 'on aus-hora-marcada' : ''}`} aria-pressed={marcado} onClick={() => alternarHora(h.inicio)} data-testid={`aus-hora-${hm}`}>
                  <div className="pub-grid-slot-col-hora"><strong className="pub-grid-hora-texto">{fmtHM(h.inicio)}</strong><small className="pub-grid-termino-texto">até {fmtHM(h.fim)}</small></div>
                  <div className="pub-grid-slot-conteudo"><span className="pub-grid-tag-livre"><Icone n="check" size={13} /> Livre</span></div>
                </button>
                {marcado && <button type="button" className="aus-x" aria-label={`Desmarcar ${fmtHM(h.inicio)}`} onClick={() => alternarHora(h.inicio)} data-testid={`aus-hora-x-${hm}`}>×</button>}
              </div>
            );
          })}
        </div>
      )}
      {erro && <Aviso tipo="erro" data-testid="aus-erro">{erro}</Aviso>}
      <div className="acoes aus-rodape">
        <span className="muted" data-testid="aus-resumo">{total === 0 ? 'Nada marcado' : `${diasInteiros.size ? `${diasInteiros.size} dia(s) inteiro(s)` : ''}${diasInteiros.size && horarios.size ? ' e ' : ''}${horarios.size ? `${horarios.size} horário(s)` : ''}`}</span>
        <Btn onClick={aoFechar} data-testid="aus-cancelar">Cancelar</Btn>
        <Btn variante="primario" disabled={enviando || total === 0} onClick={salvar} data-testid="aus-salvar">{enviando ? 'Salvando…' : 'Lançar ausência'}</Btn>
      </div>
    </div>
  );
}
