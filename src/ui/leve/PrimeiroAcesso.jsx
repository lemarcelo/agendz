/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Assistente de primeiro acesso do dono (docs/F3-primeiro-acesso.md): Serviços → Equipe → Pronto. Cada passo é opcional (Pular).
// Fala com um `adaptador` (async, { ok, erro, ... }): no site real é o de api-real.js (/api/onboarding); no Artifact, a pré-visualização
// de services/onboarding-demo.js (nada é gravado). Não importa a API simulada: textos do tipo vêm de `rotulo`.
import React, { useEffect, useMemo, useState } from 'react';
import { rotulo } from '../../domain/tipos.js';
import { Aviso, Btn, Campo, Icone } from './mini.jsx';

const dinheiro = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const lerNumero = (t) => { const n = Number(String(t).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const faixa = (mapa) => { const v = Object.values(mapa || {}); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
const ETAPAS = [['servicos', 'Serviços'], ['equipe', 'Equipe'], ['expediente', 'Expediente'], ['pronto', 'Pronto']];
const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Do expediente sugerido (um por dia) para os campos da tela: dias abertos, abre/fecha e a pausa (quando o dia tem duas faixas).
function camposDoExpediente(sug) {
  const dias = {}; let ref = null;
  for (let d = 0; d < 7; d++) { const dia = sug && sug.semana && sug.semana[d]; dias[d] = !!(dia && dia.aberto); if (dias[d] && !ref) ref = dia.faixas; }
  if (!ref) { for (const d of [1, 2, 3, 4, 5, 6]) dias[d] = true; ref = [['09:00', '12:00'], ['14:00', '18:00']]; }
  const pausa = ref.length >= 2;
  return { dias, abre: ref[0][0], fecha: ref[ref.length - 1][1], pausa, pausaDe: pausa ? ref[0][1] : '12:00', pausaAte: pausa ? ref[1][0] : '14:00' };
}
const etapaDoPasso = (passo) => (passo === 'equipe' || passo === 'expediente' || passo === 'pronto' ? passo : 'servicos'); // 'senha' já foi resolvido antes de chegar aqui

// modo 'primeiro': primeiro acesso do dono (termina com "Ir para o painel"). modo 'reconfigurar': aberto depois, em Estabelecimento > Reconfigurar;
// só ADICIONA (serviços novos, pessoas novas; nada é excluído) e o expediente enviado substitui o atual. `aoCancelar` mostra o botão Voltar.
export default function PrimeiroAcesso({ tipo, nomeLoja, adaptador, aoConcluir, aoCancelar, modo = 'primeiro', previa = false }) {
  const reconf = modo === 'reconfigurar';
  const [fase, setFase] = useState('carregando');
  const [erroCarga, setErroCarga] = useState('');
  const [estado, setEstado] = useState(null);
  const [etapa, setEtapa] = useState('servicos');
  const [marcas, setMarcas] = useState({}); // chave → { on, preco, duracao } (textos dos campos)
  const [linhas, setLinhas] = useState([{ nome: '', atende: true }]);
  const [criadas, setCriadas] = useState(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [exp, setExp] = useState(() => camposDoExpediente(null));
  // Reconfigurar com senha e desfazer: depois de concluído, a primeira tela pede a senha do dono; o histórico mostra o que cada reconfiguração mudou.
  const [confirmada, setConfirmada] = useState(false);
  const [senhaTxt, setSenhaTxt] = useState('');
  const [hist, setHist] = useState([]);
  const precisaSenha = reconf && !!adaptador.confirmarSenha && !confirmada;
  const falha = (r) => { setErro(r.erro); if (reconf && /Confirme sua senha/.test(r.erro || '')) { setConfirmada(false); setSenhaTxt(''); } };
  const profissionais = rotulo({ tipo }, 'profissional', { plural: true });

  const carregar = async () => {
    setFase('carregando'); setErroCarga('');
    const r = await adaptador.carregar();
    if (!r.ok) { setErroCarga(r.erro); setFase('erro'); return; }
    setEstado(r.estado);
    setExp(camposDoExpediente(r.estado.expediente || r.estado.expedienteSugerido));
    setEtapa(reconf ? 'servicos' : r.estado.concluido ? 'pronto' : etapaDoPasso(r.estado.passo));
    setMarcas(Object.fromEntries(r.estado.servicos.map((s) => [s.chave, { on: false, preco: String(s.preco).replace('.', ','), duracao: String(s.duracaoMin) }])));
    if (reconf && adaptador.historico) { const h = await adaptador.historico(); setHist(h.ok ? h.itens : []); }
    setFase('ok');
  };
  useEffect(() => { carregar(); }, []);

  const confirmarSenha = async () => {
    if (enviando) return;
    if (!senhaTxt) { setErro('Digite a sua senha para continuar.'); return; }
    setEnviando(true); setErro('');
    const r = await adaptador.confirmarSenha(senhaTxt);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setSenhaTxt(''); setConfirmada(true);
  };
  const trocarReconf = async (item, desfazer) => {
    if (enviando) return;
    if (!senhaTxt) { setErro(`Digite a sua senha para ${desfazer ? 'desfazer' : 'refazer'}.`); return; }
    setEnviando(true); setErro(''); setAviso('');
    const r = await (desfazer ? adaptador.desfazer : adaptador.refazer)(item.id, senhaTxt);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setHist(r.itens); setSenhaTxt('');
    setAviso(desfazer ? 'Reconfiguração desfeita. Nada que foi lançado foi alterado.' : 'Reconfiguração refeita.');
  };

  const ja = useMemo(() => new Set(estado ? estado.jaCadastrados : []), [estado]);
  const escolhidos = estado ? estado.servicos.filter((s) => marcas[s.chave]?.on && !ja.has(s.chave)) : [];
  const mudar = (chave, campo, valor) => { setMarcas((m) => ({ ...m, [chave]: { ...m[chave], [campo]: valor } })); setErro(''); };
  const todosMarcados = estado ? estado.servicos.filter((s) => !ja.has(s.chave)).every((s) => marcas[s.chave]?.on) : false;
  const marcarTodos = () => setMarcas((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, on: !ja.has(k) && !todosMarcados }])));

  const enviarServicos = async () => {
    if (enviando) return;
    const itens = [];
    for (const s of escolhidos) {
      const m = marcas[s.chave];
      const item = { chave: s.chave };
      if (!s.precos) {
        const preco = lerNumero(m.preco); const dur = lerNumero(m.duracao);
        if (!(preco >= 0 && preco <= 100000)) { setErro(`Confira o preço de “${s.nome}” (de R$ 0 a R$ 100.000).`); return; }
        if (!(Number.isInteger(dur) && dur >= 1 && dur <= 14400)) { setErro(`Confira a duração de “${s.nome}” (minutos inteiros, a partir de 1).`); return; }
        item.preco = Math.round(preco * 100) / 100; item.duracaoMin = dur;
      }
      itens.push(item);
    }
    setEnviando(true); setErro('');
    const r = await adaptador.servicos(itens);
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    setAviso(itens.length ? `${r.resultado.criados} ${r.resultado.criados === 1 ? 'serviço criado' : 'serviços criados'}.` : '');
    setEtapa('equipe');
  };

  const mudarLinha = (i, campo, valor) => { setLinhas((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x))); setErro(''); };
  const enviarEquipe = async () => {
    if (enviando) return;
    const pessoas = linhas.map((l) => ({ nome: l.nome.trim(), atende: l.atende })).filter((l) => l.nome);
    if (pessoas.some((p) => p.nome.length > 80)) { setErro('Cada nome pode ter até 80 letras.'); return; }
    setEnviando(true); setErro('');
    const r = await adaptador.equipe(pessoas);
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    if (!pessoas.length) { setEtapa('expediente'); return; }
    setCriadas(r.pessoas);
  };

  const mudarExp = (campo, valor) => { setExp((e) => ({ ...e, [campo]: valor })); setErro(''); };
  const enviarExpediente = async () => {
    if (enviando) return;
    const abertos = DIAS.filter(([d]) => exp.dias[d]);
    if (!abertos.length) { setErro('Marque ao menos um dia aberto (ou use Pular).'); return; }
    for (const h of [exp.abre, exp.fecha, ...(exp.pausa ? [exp.pausaDe, exp.pausaAte] : [])]) if (!HHMM.test(h)) { setErro('Confira os horários (use horas e minutos, como 09:00).'); return; }
    if (!(exp.abre < exp.fecha)) { setErro('A loja precisa abrir antes de fechar.'); return; }
    if (exp.pausa && !(exp.abre < exp.pausaDe && exp.pausaDe < exp.pausaAte && exp.pausaAte < exp.fecha)) { setErro('A pausa precisa ficar dentro do horário de funcionamento (início antes do fim).'); return; }
    const faixas = exp.pausa ? [[exp.abre, exp.pausaDe], [exp.pausaAte, exp.fecha]] : [[exp.abre, exp.fecha]];
    const semana = {};
    for (let d = 0; d < 7; d++) semana[d] = exp.dias[d] ? { aberto: true, faixas } : { aberto: false, faixas: [] };
    setEnviando(true); setErro('');
    const r = await adaptador.expediente(semana);
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    setEtapa('pronto');
  };
  const pularExpediente = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await adaptador.expediente({});
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    setEtapa('pronto');
  };

  const copiar = async () => {
    const texto = (criadas || []).map((p) => `${p.nome}: usuário ${p.login} · senha temporária ${p.senhaTemporaria}`).join('\n');
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); setErro('Não consegui copiar. Anote as senhas na tela.'); }
  };

  const concluir = async () => {
    if (enviando) return;
    if (reconf) { aoConcluir(); return; } // reconfigurar não conclui nada de novo: o assistente já foi concluído antes
    setEnviando(true); setErro('');
    const r = await adaptador.concluir();
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoConcluir();
  };

  const indice = ETAPAS.findIndex((e) => e[0] === etapa);
  const Raiz = reconf ? 'div' : 'main';
  return (
    <Raiz className={reconf ? 'pa pa-embutido' : 'login pa'} data-testid="pa">
      <div className="login-cartao pa-cartao">
        <header className="pa-topo">
          {reconf && aoCancelar && <div className="acoes"><Btn tamanho="sm" onClick={aoCancelar} data-testid="pa-voltar">Voltar</Btn></div>}
          <h1>{reconf ? `Reconfigurar ${nomeLoja || 'sua loja'}` : `Vamos preparar ${nomeLoja || 'sua loja'}`}</h1>
          {reconf && <p className="muted" data-testid="pa-reconf-nota">Aqui você só adiciona: serviços e pessoas que já existem continuam como estão e ninguém é excluído. O horário de funcionamento, se você salvar, substitui o atual. Dá para desfazer pelo histórico abaixo (por 30 dias).</p>}
          {previa && <Aviso data-testid="pa-previa">Pré-visualização: nada do que você marcar aqui é gravado.</Aviso>}
          {!precisaSenha && <ol className="pa-passos" aria-label="Etapas">
            {ETAPAS.map(([id, nome], i) => <li key={id} className={i === indice ? 'atual' : i < indice ? 'feito' : ''} aria-current={i === indice ? 'step' : undefined} data-testid={`pa-etapa-${id}`}><span>{i + 1}</span> {nome}</li>)}
          </ol>}
        </header>

        {fase === 'carregando' && <p className="muted" role="status" data-testid="pa-carregando">Carregando…</p>}
        {fase === 'erro' && <><Aviso tipo="erro" data-testid="pa-erro-carga">{erroCarga}</Aviso><Btn variante="primario" onClick={carregar} data-testid="pa-tentar">Tentar de novo</Btn></>}

        {fase === 'ok' && precisaSenha && (
          <section data-testid="pa-reconf-senha-tela">
            <p>Para reconfigurar a loja, confirme a sua senha. O que for mudado fica no histórico e dá para desfazer; nada que já foi lançado (agendamentos, clientes, financeiro, comissões) é alterado.</p>
            <Campo rotulo="Sua senha"><input type="password" autoComplete="current-password" value={senhaTxt} onChange={(e) => { setSenhaTxt(e.target.value); setErro(''); }} maxLength={100} data-testid="pa-reconf-senha" /></Campo>
            {aviso && <Aviso data-testid="pa-aviso">{aviso}</Aviso>}
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes"><Btn variante="primario" disabled={enviando} onClick={confirmarSenha} data-testid="pa-reconf-confirmar">{enviando ? 'Conferindo…' : 'Confirmar e continuar'}</Btn></div>
            <h2 className="pa-sub">Reconfigurações anteriores</h2>
            {!hist.length && <p className="muted" data-testid="pa-reconf-vazio">Nenhuma ainda.</p>}
            <ul className="pa-lista" data-testid="pa-reconf-historico">
              {hist.map((h) => (
                <li key={h.id} className="pa-item" data-testid={`pa-reconf-item-${h.id}`}>
                  <b>{new Date(h.criadaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b>{h.por ? ` · ${h.por}` : ''}{h.desfeitaEm ? <span className="muted"> · desfeita</span> : null}
                  <span className="muted"> · {h.servicosCriados} {h.servicosCriados === 1 ? 'serviço' : 'serviços'}, {h.pessoasCriadas} {h.pessoasCriadas === 1 ? 'pessoa' : 'pessoas'}{h.expedienteTrocado ? ', horário de funcionamento' : ''}</span>
                  <div className="acoes">
                    {h.podeDesfazer && <Btn tamanho="sm" disabled={enviando} onClick={() => trocarReconf(h, true)} data-testid={`pa-reconf-desfazer-${h.id}`}>Desfazer</Btn>}
                    {h.podeRefazer && <Btn tamanho="sm" disabled={enviando} onClick={() => trocarReconf(h, false)} data-testid={`pa-reconf-refazer-${h.id}`}>Refazer</Btn>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted">Desfazer devolve o horário de funcionamento de antes e desativa os serviços e as pessoas criados naquela vez (nada é excluído). Só a mais recente pode ser desfeita, e por 30 dias.</p>
          </section>
        )}

        {fase === 'ok' && !precisaSenha && etapa === 'servicos' && (
          <section data-testid="pa-servicos">
            <p>Marque os serviços que a sua loja oferece. Você pode ajustar preço e duração agora ou depois, em Serviços.</p>
            {estado.servicos.length > 1 && <div className="acoes"><Btn tamanho="sm" onClick={marcarTodos} data-testid="pa-marcar-todos">{todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}</Btn></div>}
            <ul className="pa-lista">
              {estado.servicos.map((s, i) => {
                const m = marcas[s.chave] || {};
                const novoGrupo = !!s.categoria && s.categoria !== (estado.servicos[i - 1] && estado.servicos[i - 1].categoria);
                const existe = ja.has(s.chave);
                const fx = faixa(s.precos);
                return (
                  <React.Fragment key={s.chave}>
                  {novoGrupo && <li className="pa-categoria" data-testid={`pa-categoria-${i}`}><b>{s.categoria}</b></li>}
                  <li className={`pa-item${m.on ? ' marcado' : ''}`} data-testid={`pa-item-${s.chave}`}>
                    <label className="pa-marcar">
                      <input type="checkbox" checked={!!m.on || existe} disabled={existe} onChange={(e) => mudar(s.chave, 'on', e.target.checked)} data-testid={`pa-marcar-${s.chave}`} />
                      <span><b>{s.nome}</b>{existe ? <small className="muted"> · já está na sua loja</small> : null}</span>
                    </label>
                    {m.on && !existe && (s.precos
                      ? <p className="muted pa-porte">Preço por porte do veículo: {dinheiro(fx[0])} a {dinheiro(fx[1])}. Ajuste em Serviços.</p>
                      : <div className="pa-campos">
                          <Campo rotulo="Preço (R$)"><input inputMode="decimal" value={m.preco} onChange={(e) => mudar(s.chave, 'preco', e.target.value)} maxLength={9} data-testid={`pa-preco-${s.chave}`} /></Campo>
                          <Campo rotulo="Duração (min)"><input inputMode="numeric" value={m.duracao} onChange={(e) => mudar(s.chave, 'duracao', e.target.value)} maxLength={5} data-testid={`pa-duracao-${s.chave}`} /></Campo>
                        </div>)}
                  </li>
                  </React.Fragment>
                );
              })}
            </ul>
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn onClick={() => { setAviso(''); setEtapa('equipe'); }} data-testid="pa-pular-servicos">Pular</Btn>
              <Btn variante="primario" disabled={enviando || !escolhidos.length} onClick={enviarServicos} data-testid="pa-continuar-servicos">{enviando ? 'Salvando…' : `Continuar${escolhidos.length ? ` (${escolhidos.length})` : ''}`}</Btn>
            </div>
          </section>
        )}

        {fase === 'ok' && !precisaSenha && etapa === 'equipe' && !criadas && (
          <section data-testid="pa-equipe">
            {aviso && <Aviso data-testid="pa-aviso">{aviso}</Aviso>}
            <p>{reconf ? 'Quem entra na equipe? Digite só o nome das pessoas novas (quem já está na equipe não aparece aqui e não é alterado): ' : 'Quem trabalha com você? Digite só o nome: '}cada pessoa recebe um usuário e uma senha temporária para o primeiro acesso.</p>
            <ul className="pa-lista">
              {linhas.map((l, i) => (
                <li key={i} className="pa-linha">
                  <Campo rotulo={`Nome ${i + 1}`}><input value={l.nome} onChange={(e) => mudarLinha(i, 'nome', e.target.value)} maxLength={80} autoComplete="off" data-testid={`pa-nome-${i}`} /></Campo>
                  <label className="pa-check"><input type="checkbox" checked={l.atende} onChange={(e) => mudarLinha(i, 'atende', e.target.checked)} data-testid={`pa-atende-${i}`} /> Atende clientes</label>
                  {linhas.length > 1 && <button type="button" className="btn btn-neutro btn-sm" onClick={() => setLinhas((x) => x.filter((_, j) => j !== i))} aria-label={`Remover o nome ${i + 1}`} data-testid={`pa-remover-${i}`}><Icone n="x" size={15} /></button>}
                </li>
              ))}
            </ul>
            {linhas.length < 10 && <div className="acoes"><Btn tamanho="sm" onClick={() => setLinhas((l) => [...l, { nome: '', atende: true }])} data-testid="pa-add">Adicionar pessoa</Btn></div>}
            <p className="muted">Os {profissionais} que “atendem clientes” aparecem na agenda.</p>
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn onClick={() => { setAviso(''); setEtapa('expediente'); }} data-testid="pa-pular-equipe">Pular</Btn>
              <Btn variante="primario" disabled={enviando} onClick={enviarEquipe} data-testid="pa-criar-acessos">{enviando ? 'Salvando…' : 'Criar acessos'}</Btn>
            </div>
          </section>
        )}

        {fase === 'ok' && !precisaSenha && etapa === 'equipe' && criadas && (
          <section data-testid="pa-acessos">
            <Aviso tipo="alerta">Anote agora: estas senhas <b>não aparecem de novo</b>. Cada pessoa troca a senha no primeiro login.</Aviso>
            <ul className="pa-lista">
              {criadas.map((p) => <li key={p.login} className="pa-acesso"><b>{p.nome}</b><span>usuário <code>{p.login}</code></span><span>senha <code data-testid={`pa-senha-${p.login}`}>{p.senhaTemporaria}</code></span></li>)}
            </ul>
            <div className="acoes"><Btn tamanho="sm" onClick={copiar} data-testid="pa-copiar">{copiado ? 'Copiado' : 'Copiar tudo'}</Btn></div>
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes"><Btn variante="primario" onClick={() => { setErro(''); setEtapa('expediente'); }} data-testid="pa-anotei">Anotei, continuar</Btn></div>
          </section>
        )}

        {fase === 'ok' && !precisaSenha && etapa === 'expediente' && (
          <section data-testid="pa-expediente">
            <p>Quando a loja funciona? A agenda só aceita horários dentro deste expediente. Dá para ajustar cada dia e cada pessoa depois.</p>
            <fieldset className="pa-dias"><legend>Dias abertos</legend>
              {DIAS.map(([d, nome]) => <label key={d} className={`pa-dia${exp.dias[d] ? ' on' : ''}`}><input type="checkbox" checked={!!exp.dias[d]} onChange={(e) => setExp((x) => ({ ...x, dias: { ...x.dias, [d]: e.target.checked } }))} data-testid={`pa-dia-${d}`} /> {nome}</label>)}
            </fieldset>
            <div className="pa-campos">
              <Campo rotulo="Abre às"><input type="time" value={exp.abre} onChange={(e) => mudarExp('abre', e.target.value)} data-testid="pa-abre" /></Campo>
              <Campo rotulo="Fecha às"><input type="time" value={exp.fecha} onChange={(e) => mudarExp('fecha', e.target.value)} data-testid="pa-fecha" /></Campo>
            </div>
            <label className="pa-check"><input type="checkbox" checked={exp.pausa} onChange={(e) => mudarExp('pausa', e.target.checked)} data-testid="pa-pausa" /> Fecho para o almoço (pausa)</label>
            {exp.pausa && <div className="pa-campos">
              <Campo rotulo="Pausa de"><input type="time" value={exp.pausaDe} onChange={(e) => mudarExp('pausaDe', e.target.value)} data-testid="pa-pausa-de" /></Campo>
              <Campo rotulo="Volta às"><input type="time" value={exp.pausaAte} onChange={(e) => mudarExp('pausaAte', e.target.value)} data-testid="pa-pausa-ate" /></Campo>
            </div>}
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn onClick={pularExpediente} disabled={enviando} data-testid="pa-pular-expediente">Pular</Btn>
              <Btn variante="primario" disabled={enviando} onClick={enviarExpediente} data-testid="pa-continuar-expediente">{enviando ? 'Salvando…' : 'Continuar'}</Btn>
            </div>
          </section>
        )}

        {fase === 'ok' && !precisaSenha && etapa === 'pronto' && (
          <section data-testid="pa-pronto">
            <p><b>Tudo pronto.</b> {reconf ? 'Nada que já existia foi removido.' : 'Você pode mudar serviços, equipe e horários quando quiser, no painel.'}</p>
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes"><Btn variante="primario" disabled={enviando} onClick={concluir} data-testid="pa-concluir">{enviando ? 'Abrindo…' : reconf ? 'Voltar ao estabelecimento' : 'Ir para o painel'}</Btn></div>
          </section>
        )}
      </div>
    </Raiz>
  );
}
