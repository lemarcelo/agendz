/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:003f7f8e99 */
import { consumirAbaEstabelecimento } from './destino.js';
import React, { useState } from 'react';
import { estabelecimento as apiEst, excecoes as apiEx, afetadosPorExcecoes } from '../services/api.js';
import { FORMAS_PAGAMENTO, ehDono } from '../domain/rules.js';
import { configLink } from '../domain/publico.js';
import { CAMPOS_ATENDER, CAMPOS_DE_VEICULO, CAMPOS_OBRIGATORIOS_PADRAO } from '../domain/engine.js';
import { DIAS_SEMANA, fmtDate, fmtHM, fromYmd, ymd, startOfDay } from '../domain/time.js';
import { TIPOS_EXCECAO, diasDaExcecao } from '../domain/schedule.js';
import { FERIADOS_NACIONAIS } from '../domain/feriados.js';
import { Abas, Aviso, Btn, Campo, Icon, Interruptor, Modal, Vazio } from './common.jsx';
import { EditorNotificacoes, EditorPixCancelamento } from './Notif.jsx';
import { SeletorGrupo } from './Grupo.jsx';
import { Cupons } from './Cupons.jsx';
import PrimeiroAcesso from './leve/PrimeiroAcesso.jsx';
import { criarAdaptadorDemo } from '../services/onboarding-demo.js';
import { nomeCliente, nomeServicos } from './format.js';
import { toast, useStore } from './hooks.js';
import { capAtiva, rot, tipoDe, TIPOS, voc, Voc } from '../domain/tipos.js';
import { coordenadasDeTexto } from '../domain/localizacao.js';

const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

export function EditorSemana({ semana, onChange }) {
  const set = (d, patch) => onChange({ ...semana, [d]: { ...semana[d], ...patch } });
  return (
    <div className="semana">
      {ORDEM_SEMANA.map((d) => {
        const dia = semana[d];
        return (
          <div key={d} className={`semana-dia ${dia.aberto ? '' : 'fechado'}`}>
            <label className="semana-nome">
              <input type="checkbox" checked={dia.aberto} onChange={(e) => set(d, { aberto: e.target.checked, faixas: e.target.checked && !dia.faixas.length ? [['08:00', '12:00'], ['14:00', '19:00']] : dia.faixas })} aria-label={`${DIAS_SEMANA[d]} aberto`} />
              <b>{DIAS_SEMANA[d]}</b>
            </label>
            {dia.aberto ? (
              <div className="faixas">
                {dia.faixas.map((f, i) => (
                  <span key={i} className="faixa">
                    <input type="time" value={f[0]} onChange={(e) => set(d, { faixas: dia.faixas.map((x, k) => (k === i ? [e.target.value, x[1]] : x)) })} aria-label={`${DIAS_SEMANA[d]} início ${i + 1}`} />
                    <span className="muted">às</span>
                    <input type="time" value={f[1]} onChange={(e) => set(d, { faixas: dia.faixas.map((x, k) => (k === i ? [x[0], e.target.value] : x)) })} aria-label={`${DIAS_SEMANA[d]} fim ${i + 1}`} />
                    <button type="button" className="icone-btn" onClick={() => set(d, { faixas: dia.faixas.filter((_, k) => k !== i) })} aria-label="Remover faixa"><Icon n="x" size={14} /></button>
                  </span>
                ))}
                <Btn tamanho="sm" icone="plus" onClick={() => set(d, { faixas: [...dia.faixas, ['14:00', '18:00']] })}>Faixa</Btn>
              </div>
            ) : <span className="muted">Fechado</span>}
          </div>
        );
      })}
    </div>
  );
}

function ModalImpacto({ afetados, st, onEscolher, onClose, titulo }) {
  return (
    <Modal titulo={titulo || 'Há agendamentos nesse período'} onClose={onClose} largura={560}
      rodape={<><Btn onClick={onClose}>Voltar</Btn><Btn variante="perigo" onClick={() => onEscolher('cancelar')} data-testid="impacto-cancelar">Cancelar os agendamentos</Btn><Btn variante="primario" onClick={() => onEscolher('avisar')} data-testid="impacto-avisar">Avisar os clientes</Btn></>}>
      <p>Esses agendamentos deixam de caber na agenda. Escolha o que fazer com eles:</p>
      <ul className="lista-impacto">
        {afetados.map((a) => <li key={a.id}><b>{fmtDate(a.inicio)} {fmtHM(a.inicio)}</b> · {nomeCliente(st, a)} · {nomeServicos(st, a)}</li>)}
      </ul>
      <p className="muted"><b>Avisar</b> envia ao cliente a mensagem pronta oferecendo remarcar. <b>Cancelar</b> deixa o horário cinza na agenda.</p>
    </Modal>
  );
}

// Exceções (feriado, folga, período fora, horário diferente) do estabelecimento ou de um profissional.
export function PainelExcecoes({ escopo }) {
  const { state: st, agora } = useStore();
  const escala = escopo === 'estab' ? st.estabelecimento.escala : st.usuarios.find((u) => u.id === escopo).escala;
  const vazio = { tipo: 'folga', inicio: ymd(startOfDay(agora)), fim: '', rotulo: '', faixas: [['09:00', '13:00']] };
  const [f, setF] = useState(vazio);
  const [impacto, setImpacto] = useState(null);
  const [erro, setErro] = useState('');
  const lista = [...escala.excecoes].sort((a, b) => a.inicio.localeCompare(b.inicio));

  const gravar = (destino, ids) => {
    const ex = { ...f, fim: f.fim || f.inicio, rotulo: f.rotulo || TIPOS_EXCECAO[f.tipo] };
    const r = apiEx.salvar(escopo, ex, destino, ids);
    if (!r.ok) { setErro(r.erros[0]); return; }
    setErro(''); setImpacto(null); setF(vazio);
    toast('Exceção adicionada à escala.');
  };
  const tentar = () => {
    const ex = { ...f, fim: f.fim || f.inicio, rotulo: f.rotulo || TIPOS_EXCECAO[f.tipo] };
    if (!ex.inicio) { setErro('Escolha a data.'); return; }
    if (ex.fim < ex.inicio) { setErro('A data final não pode ser antes da inicial.'); return; }
    const afet = apiEx.impacto(escopo, ex);
    if (afet.length) setImpacto(afet); else gravar();
  };

  return (
    <div className="excecoes">
      <h4>Exceções da escala</h4>
      <p className="muted">Feriados, folgas, períodos fora ou dias com horário diferente. Elas se sobrepõem à escala semanal.</p>
      {lista.length === 0 ? <p className="muted">Nenhuma exceção cadastrada.</p> : (
        <ul className="ex-lista">
          {lista.map((e) => (
            <li key={e.id} className={`ex ex-${e.tipo}`}>
              <span className="chip chip-p">{TIPOS_EXCECAO[e.tipo]}</span>
              <b>{e.rotulo}</b>
              <span className="muted">{fmtDate(fromYmd(e.inicio))}{e.fim && e.fim !== e.inicio ? ` a ${fmtDate(fromYmd(e.fim))}` : ''}{e.tipo === 'horario' ? ` · ${e.faixas.map((x) => x.join('–')).join(' e ')}` : ''}{e.origem === 'calendario' ? ' · do calendário' : ''}</span>
              <button type="button" className="icone-btn" onClick={() => apiEx.remover(escopo, e.id)} aria-label={`Remover ${e.rotulo}`}><Icon n="trash" size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="ex-form">
        <Campo rotulo="Tipo">
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} data-testid="ex-tipo">{Object.entries(TIPOS_EXCECAO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
        </Campo>
        <Campo rotulo="De"><input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} data-testid="ex-inicio" /></Campo>
        <Campo rotulo="Até (opcional)"><input type="date" value={f.fim} min={f.inicio} onChange={(e) => setF({ ...f, fim: e.target.value })} data-testid="ex-fim" /></Campo>
        <Campo rotulo="Descrição"><input value={f.rotulo} placeholder={`Ex.: ${voc('exemploFolga')}`} onChange={(e) => setF({ ...f, rotulo: e.target.value })} /></Campo>
        {f.tipo === 'horario' && (
          <div className="campo-largo">
            <span className="campo-rotulo">Horário nesses dias</span>
            <div className="faixas">
              {f.faixas.map((x, i) => (
                <span key={i} className="faixa">
                  <input type="time" value={x[0]} onChange={(e) => setF({ ...f, faixas: f.faixas.map((y, k) => (k === i ? [e.target.value, y[1]] : y)) })} />
                  <span className="muted">às</span>
                  <input type="time" value={x[1]} onChange={(e) => setF({ ...f, faixas: f.faixas.map((y, k) => (k === i ? [y[0], e.target.value] : y)) })} />
                  <button type="button" className="icone-btn" onClick={() => setF({ ...f, faixas: f.faixas.filter((_, k) => k !== i) })} aria-label="Remover faixa"><Icon n="x" size={14} /></button>
                </span>
              ))}
              <Btn tamanho="sm" icone="plus" onClick={() => setF({ ...f, faixas: [...f.faixas, ['14:00', '18:00']] })}>Faixa</Btn>
            </div>
          </div>
        )}
        <div className="campo-largo"><Btn variante="primario" icone="plus" onClick={tentar} data-testid="ex-add">Adicionar exceção</Btn></div>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {impacto && <ModalImpacto afetados={impacto} st={st} onClose={() => setImpacto(null)} onEscolher={(d) => gravar(d, impacto.map((a) => a.id))} />}
    </div>
  );
}

export function PainelEscala({ escopo }) {
  const { state: st } = useStore();
  const [semana, setSemana] = useState(() => structuredClone(escopo === 'estab' ? st.estabelecimento.escala.semana : st.usuarios.find((u) => u.id === escopo).escala.semana));
  const [sujo, setSujo] = useState(false);
  const salvar = () => {
    const r = escopo === 'estab' ? apiEst.salvar({ escala: { semana } }) : apiEst.salvarEscalaProfissional(escopo, semana);
    if (r.ok) { toast('Escala salva.'); setSujo(false); } else toast(r.erros[0], 'erro');
  };
  return (
    <div className="escala">
      {escopo !== 'estab' && <Aviso>O {rot('profissional')} só recebe agendamentos dentro do horário da {rot('loja')} e da própria escala.</Aviso>}
      <EditorSemana semana={semana} onChange={(s) => { setSemana(s); setSujo(true); }} />
      <div className="acoes"><Btn variante="primario" onClick={salvar} disabled={!sujo} data-testid="salvar-escala">Salvar escala semanal</Btn></div>
      <PainelExcecoes escopo={escopo} />
    </div>
  );
}

function PainelCalendario() {
  const { state: st } = useStore();
  const cal = st.estabelecimento.calendario;
  const [impacto, setImpacto] = useState(null);
  const vincular = (v) => {
    if (v) {
      const afet = apiEx.impactoFeriados();
      if (afet.length) { setImpacto(afet); return; }
    }
    apiEx.vincularFeriados(v);
    toast(v ? 'Calendário de feriados vinculado.' : 'Calendário desvinculado.');
  };
  return (
    <div className="bloco-largo">
      <Aviso>Simulação: no sistema real, aqui entra a autorização com a conta Google. Os agendamentos viram eventos no Google Agenda da {rot('loja')} e do {rot('profissional')} (sem duplicar quando o e-mail é o mesmo).</Aviso>
      <Interruptor checked={cal.feriadosVinculado} onChange={vincular} rotulo={`Calendário de feriados: ${cal.feriadosNome}`} descricao="Os feriados entram na escala como dias sem atendimento." id="sw-feriados" />
      {cal.feriadosVinculado && (
        <ul className="feriados">{FERIADOS_NACIONAIS.map(([d, r]) => <li key={d}><span className="muted">{fmtDate(fromYmd(d))}</span> {r}</li>)}</ul>
      )}
      <Interruptor checked={cal.enviarEventos} onChange={(v) => apiEst.salvar({ calendario: { ...cal, enviarEventos: v } })} rotulo="Enviar agendamentos para o Google Agenda" descricao={`Para ${st.estabelecimento.email} e para o e-mail do ${rot('profissional')}.`} />
      {impacto && <ModalImpacto titulo="Feriados com agendamentos" afetados={impacto} st={st} onClose={() => setImpacto(null)} onEscolher={(d) => { apiEx.vincularFeriados(true, d, impacto.map((a) => a.id)); setImpacto(null); toast('Calendário de feriados vinculado.'); }} />}
    </div>
  );
}

import { PainelMarca } from './Marca.jsx';
export default function Estabelecimento({ user }) {
  const { state: st } = useStore();
  const e = st.estabelecimento;
  const [aba, setAba] = useState(() => consumirAbaEstabelecimento() || 'dados');
  const [dados, setDados] = useState({ nome: e.nome, telefone: e.telefone, endereco: e.endereco || '', enderecoNoLink: e.enderecoNoLink !== false, localizacaoNoWhatsapp: !!e.localizacaoNoWhatsapp, localizacao: Number.isFinite(e.latitude) ? `${e.latitude}, ${e.longitude}` : '', email: e.email, visaoPadrao: e.visaoPadrao, grupoMovimentacaoId: e.grupoMovimentacaoId });
  const [notifs, setNotifs] = useState(e.notificacoes);
  const [notifSujo, setNotifSujo] = useState(false);
  const [pixCanc, setPixCanc] = useState(e.pixCancelamento || null);
  const [ddd, setDdd] = useState('');

  const salvarDados = () => {
    const { localizacao, ...resto } = dados;
    const c = localizacao.trim() ? coordenadasDeTexto(localizacao) : null;
    if (localizacao.trim() && !c) { toast('Não achei coordenadas nesse texto. Use “latitude, longitude” ou o link completo do Google Maps.', 'erro'); return; }
    const r = apiEst.salvar({ ...resto, latitude: c ? c.lat : null, longitude: c ? c.lng : null }); if (r.ok) toast('Dados salvos.'); else toast(r.erros[0], 'erro'); };
  const addDdd = () => {
    const n = Number(ddd);
    if (!(n >= 11 && n <= 99)) { toast('Informe um DDD com 2 dígitos.', 'erro'); return; }
    if (e.ddds.includes(n)) { toast('Esse DDD já está liberado.', 'erro'); return; }
    apiEst.salvar({ ddds: [...e.ddds, n].sort() }); setDdd('');
  };

  return (
    <section className="tela">
      <header className="tela-topo"><h1>Estabelecimento</h1></header>
      <Abas valor={aba} onChange={setAba} ordem="estabelecimento" itens={[['dados', 'Dados'], ['escala', 'Horário e exceções'], ['calendario', 'Calendário'], ...(capAtiva('usaRecursoFisico') ? [['boxes', 'Boxes']] : []), ['marca', 'Aparência'], ['notificacoes', 'Notificações'], ['regras', 'Regras'], ['cupons', 'Cupons'], ...(ehDono(user) ? [['reconfigurar', 'Reconfigurar']] : [])]} />
      <div className="painel">
        {aba === 'dados' && (
          <div className="form-grade">
            <Campo rotulo="Tipo de estabelecimento" dica={`Definido na criação da ${rot('loja')}; não pode ser alterado.`}><input value={TIPOS[tipoDe(st.estabelecimento)].nome} readOnly disabled data-testid="est-tipo" /></Campo>
            <Campo rotulo={`Nome da ${rot('loja')}`}><input value={dados.nome} onChange={(x) => setDados({ ...dados, nome: x.target.value })} /></Campo>
            <Campo rotulo="Telefone"><input value={dados.telefone} onChange={(x) => setDados({ ...dados, telefone: x.target.value })} /></Campo>
            <Campo rotulo="Endereço" className="campo-largo" dica="Aparece na página de agendamento do cliente quando o interruptor abaixo está ligado."><input value={dados.endereco} maxLength={200} onChange={(x) => setDados({ ...dados, endereco: x.target.value })} data-testid="est-endereco" /></Campo>
            <label className="pa-check campo-largo"><input type="checkbox" checked={dados.enderecoNoLink} onChange={(x) => setDados({ ...dados, enderecoNoLink: x.target.checked })} data-testid="est-endereco-no-link" /> Mostrar o endereço na página de agendamento do cliente</label>
            <Campo rotulo="Localização (GPS): latitude, longitude ou link do Google Maps" className="campo-largo" dica="Pode ser preenchida depois de começar a usar."><input value={dados.localizacao} maxLength={500} placeholder="Ex.: -25.428356, -49.273251" onChange={(x) => setDados({ ...dados, localizacao: x.target.value })} data-testid="est-localizacao" /></Campo>
            <label className="pa-check campo-largo"><input type="checkbox" checked={dados.localizacaoNoWhatsapp} onChange={(x) => setDados({ ...dados, localizacaoNoWhatsapp: x.target.checked })} data-testid="est-localizacao-whatsapp" /> Mandar o link da localização junto da mensagem de WhatsApp com o link de agendamento</label>
            <Campo rotulo={`E-mail (Google Agenda da ${rot('loja')})`}><input type="email" value={dados.email} onChange={(x) => setDados({ ...dados, email: x.target.value })} /></Campo>
            <div className="campo-largo"><SeletorGrupo st={st} valor={dados.grupoMovimentacaoId} onChange={(v) => setDados({ ...dados, grupoMovimentacaoId: v })} rotulo="Grupo de movimentação padrão" dica="A conta responsável por este grupo recebe os serviços e paga as despesas que não têm grupo próprio. Cada serviço e cada despesa pode escolher outro grupo." testid="estab-grupo" /></div>
            <div className="campo-largo"><Btn variante="primario" onClick={salvarDados} data-testid="salvar-dados">Salvar dados</Btn></div>
          </div>
        )}
        {aba === 'escala' && <PainelEscala escopo="estab" />}
        {aba === 'calendario' && <PainelCalendario />}
        {aba === 'boxes' && <PainelBoxes e={e} />}
        {aba === 'marca' && <PainelMarca />}
        {aba === 'cupons' && <Cupons />}
        {aba === 'reconfigurar' && ehDono(user) && <Reconfigurar st={st} />}
        {aba === 'notificacoes' && (
          <>
            <p>Valem para todos os serviços que não têm notificações próprias. Quando um serviço tem as suas, elas substituem estas por completo.</p>
            <EditorNotificacoes lista={notifs} onChange={(l) => { setNotifs(l); setNotifSujo(true); }} />
            <EditorPixCancelamento valor={pixCanc} temAvisos={notifs.length > 0} onChange={(v) => { setPixCanc(v); setNotifSujo(true); }} />
            <div className="acoes"><Btn variante="primario" disabled={!notifSujo} onClick={() => { const r = apiEst.salvar({ notificacoes: notifs, pixCancelamento: pixCanc || undefined }); if (r.ok) { toast('Notificações salvas.'); setNotifSujo(false); } else toast(r.erros[0], 'erro'); }} data-testid="salvar-notifs">Salvar notificações</Btn></div>
          </>
        )}
        {aba === 'regras' && (
          <div className="bloco-largo">
            <Interruptor checked={!!e.confirmacaoServico} onChange={(v) => apiEst.salvar({ confirmacaoServico: v })} rotulo={Voc('confirmacao')} descricao={`O ${rot('profissional')} informa quais serviços foram feitos para concluir o atendimento. Sem isso, o atendimento conclui sozinho quando o horário passa. A regra do serviço prevalece.`} />
            <LinkAgendamentoRegras e={e} />
            <CamposObrigatorios e={e} />
            <PagamentoRegras st={st} e={e} />
            {ehDono(user) && <Campo rotulo={`Comissão padrão do ${rot('profissional')} (%)`} dica={`Parte de cada ${rot('atendimento')} que fica com o ${rot('profissional')}. O restante é do estabelecimento. Pode ser mudada por serviço ou por ${rot('profissional')}. Só o proprietário altera e vê.`}>
              <ComissaoPadrao valor={e.comissaoPadrao ?? 50} />
            </Campo>}
            <div className="campo">
              <span className="campo-rotulo">DDDs liberados para agendar pelo WhatsApp</span>
              <div className="ddds">{e.ddds.map((d) => <span key={d} className="chip">{d}<button type="button" className="icone-btn" onClick={() => apiEst.salvar({ ddds: e.ddds.filter((x) => x !== d) })} aria-label={`Remover DDD ${d}`}><Icon n="x" size={12} /></button></span>)}</div>
              <div className="linha-campos"><input value={ddd} inputMode="numeric" maxLength={2} placeholder="DDD" onChange={(x) => setDdd(x.target.value.replace(/\D/g, ''))} aria-label="Novo DDD" /><Btn tamanho="sm" icone="plus" onClick={addDdd}>Liberar DDD</Btn></div>
              <small className="muted">Clientes de outros DDDs recebem a mensagem de que não é possível agendar.</small>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Reconfigurar o estabelecimento: reabre o assistente de primeiro acesso (serviços do tipo da loja, equipe nova, horário de funcionamento).
// Só adiciona (serviço e pessoa nova); nada é excluído. No Artifact é pré-visualização (nada é gravado); no site real o servidor grava.
function Reconfigurar({ st }) {
  const [aberto, setAberto] = useState(false);
  const adaptador = React.useMemo(() => (aberto ? criarAdaptadorDemo({ reconfigurar: true }) : null), [aberto]);
  if (aberto) return <PrimeiroAcesso modo="reconfigurar" previa tipo={tipoDe(st.estabelecimento)} nomeLoja={st.estabelecimento.nome} adaptador={adaptador} aoConcluir={() => setAberto(false)} aoCancelar={() => setAberto(false)} />;
  return (
    <div className="bloco-largo" data-testid="reconfigurar">
      <p>Refaça a configuração do estabelecimento com o assistente: escolha, entre os serviços do tipo da {rot('loja')}, os que você quer poder prestar; crie novas pessoas na equipe; e redefina o horário de funcionamento.</p>
      <Aviso>Só adiciona: serviços e pessoas que já existem ficam como estão e <b>ninguém da equipe é excluído</b>.</Aviso>
      <div><Btn variante="primario" onClick={() => setAberto(true)} data-testid="reconfigurar-abrir">Abrir o assistente</Btn></div>
    </div>
  );
}

// Boxes (vagas de atendimento): cada serviço ocupa um box, do carro entrar até sair. Dois carros nunca ficam no mesmo box ao mesmo tempo.
function PainelBoxes({ e }) {
  const [lista, setLista] = useState(() => (e.boxes || []).map((b) => ({ ...b })));
  const [erro, setErro] = useState('');
  const sujo = JSON.stringify(lista) !== JSON.stringify(e.boxes || []);
  const salvar = () => { const r = apiEst.salvar({ boxes: lista.map((b) => ({ id: b.id, nome: b.nome, ativo: b.ativo !== false })) }); if (!r.ok) { setErro(r.erros[0]); return; } setErro(''); toast('Boxes salvos.'); };
  return (
    <div className="bloco-largo" data-testid="painel-boxes">
      <p>Cada serviço ocupa um box, da entrada do carro até o fim. A quantidade de boxes limita quantos carros ficam ao mesmo tempo, além da agenda de cada {rot('profissional')}. Ao agendar, o app escolhe um box livre (dá para escolher à mão).</p>
      <div className="boxes-lista">
        {lista.map((b, i) => (
          <div key={b.id || `novo-${i}`} className="box-linha" data-testid={`box-${i}`}>
            <Campo rotulo={`Box ${i + 1}`}><input value={b.nome} maxLength={30} onChange={(x) => setLista(lista.map((y, j) => (j === i ? { ...y, nome: x.target.value } : y)))} data-testid={`box-nome-${i}`} /></Campo>
            <label className="check-linha"><input type="checkbox" checked={b.ativo !== false} onChange={(x) => setLista(lista.map((y, j) => (j === i ? { ...y, ativo: x.target.checked } : y)))} data-testid={`box-ativo-${i}`} /> Ativo</label>
            {!b.id && <button type="button" className="icone-btn" onClick={() => setLista(lista.filter((_, j) => j !== i))} aria-label={`Remover box ${i + 1}`}><Icon n="trash" size={16} /></button>}
          </div>
        ))}
      </div>
      {erro && <Aviso tipo="erro"><span data-testid="boxes-erro">{erro}</span></Aviso>}
      <div className="acoes">
        <Btn icone="plus" disabled={lista.length >= 20} onClick={() => setLista([...lista, { nome: `Box ${lista.length + 1}`, ativo: true }])} data-testid="box-add">Adicionar box</Btn>
        <Btn variante="primario" disabled={!sujo} onClick={salvar} data-testid="box-salvar">Salvar boxes</Btn>
      </div>
      <small className="muted">Box com histórico de atendimentos não pode ser removido, só desativado. Para desativar, remarque antes os carros agendados nele.</small>
    </div>
  );
}

function ComissaoPadrao({ valor }) {
  const [v, setV] = useState(String(valor));
  const salvar = () => { const r = apiEst.salvar({ comissaoPadrao: v === '' ? null : Number(v) }); if (r.ok) toast('Comissão padrão salva.'); else toast(r.erros[0], 'erro'); };
  return <div className="linha-campos"><input type="number" min="0" max="100" step="1" value={v} onChange={(x) => setV(x.target.value)} data-testid="comissao-padrao" /><Btn tamanho="sm" onClick={salvar} data-testid="salvar-comissao-padrao">Salvar</Btn></div>;
}

// Formas de pagamento do atendimento local, conta de cada forma e uso da integração Pix.
function PagamentoRegras({ st, e }) {
  const contas = st.financeiro.contas;
  const por = e.contaPorForma || {};
  const salvar = (patch, msg) => { const r = apiEst.salvar(patch); if (r.ok) toast(msg || 'Salvo.'); else toast(r.erros[0], 'erro'); };
  return (
    <div className="bloco" data-testid="regras-pagamento">
      <Interruptor checked={e.usaIntegracaoPix !== false} onChange={(v) => salvar({ usaIntegracaoPix: v }, v ? 'Integração Pix ligada.' : 'Integração Pix desligada.')} rotulo="Usa integração Pix" descricao="Desligado: o Pix vira só um registro manual de pagamento. Cobrança, QR, extrato e sincronização com o banco ficam bloqueados." id="usa-pix" />
      <Campo rotulo="Forma de pagamento padrão" dica="Já vem escolhida no atendimento local. Sem padrão, quem registra precisa escolher a forma.">
        <select value={e.formaPagamentoPadrao ?? 'pix'} onChange={(x) => salvar({ formaPagamentoPadrao: x.target.value }, 'Forma padrão salva.')} data-testid="forma-padrao">
          <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="">Sem padrão (sempre perguntar)</option>
        </select>
      </Campo>
      <div className="form-grade">
        {Object.entries(FORMAS_PAGAMENTO).map(([k, r]) => (
          <Campo key={k} rotulo={`Conta do ${r}`} dica={k === 'pix' ? 'Pode ser a mesma conta de outra forma.' : undefined}>
            <select value={por[k] || ''} onChange={(x) => salvar({ contaPorForma: { ...por, [k]: x.target.value } }, `Conta do ${r} salva.`)} data-testid={`conta-forma-${k}`}>
              <option value="">Conta do grupo de movimentação</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.apelido}</option>)}
            </select>
          </Campo>
        ))}
      </div>
    </div>
  );
}

// Link de agendamento do cliente: liga/desliga e até quantos dias à frente o cliente pode marcar.
function LinkAgendamentoRegras({ e }) {
  const cfg = configLink({ estabelecimento: e }); // com os padrões de fábrica (tudo obrigatório) onde o dono ainda não mexeu
  const alternaVei = (k) => salvar({ veiculoObrigatorio: cfg.veiculoObrigatorio.includes(k) ? cfg.veiculoObrigatorio.filter((x) => x !== k) : [...cfg.veiculoObrigatorio, k] }, 'Regra do veículo no link salva.');
  const salvar = (patch, msg) => { const r = apiEst.salvar({ linkAgendamento: { ...cfg, ...patch } }); if (r.ok) toast(msg); else toast(r.erros[0], 'erro'); };
  return (
    <div className="bloco" data-testid="regras-link">
      <h3>Link de agendamento do cliente</h3>
      <Interruptor checked={cfg.ativo !== false} onChange={(v) => salvar({ ativo: v }, v ? 'Link ligado.' : 'Link desligado.')} rotulo="Cliente agenda pelo link" descricao="O botão “Link de agendamento” fica na Agenda. Desligado, a página do cliente avisa que está indisponível." />
      <Interruptor checked={cfg.telefoneObrigatorio !== false} onChange={(v) => salvar({ telefoneObrigatorio: v }, v ? 'Telefone obrigatório no link.' : 'Telefone opcional no link.')} rotulo="Telefone obrigatório no link" descricao="Ligado (padrão), o cliente só pede o horário com telefone e recebe os avisos. Desligado, ele pode pedir só com o nome; o pedido fica sem cadastro e sem aviso por WhatsApp." testid="link-telefone-obrigatorio" />
      <Interruptor checked={cfg.nomeObrigatorio} onChange={(v) => salvar({ nomeObrigatorio: v }, v ? 'Nome obrigatório no link.' : 'Nome opcional no link.')} rotulo="Nome obrigatório no link" descricao="Desligado, o cliente pode pedir o horário sem dizer o nome. Sem nome e sem telefone o horário fica anônimo." testid="link-nome-obrigatorio" />
      {capAtiva('usaVeiculo') && (
        <fieldset className="conj" data-testid="link-veiculo-obrigatorio">
          <legend>Dados do veículo obrigatórios no link</legend>
          {[['placa', 'Placa'], ['modelo', 'Modelo'], ['porte', 'Porte']].map(([k, r]) => (
            <label key={k} className="check-linha"><input type="checkbox" checked={cfg.veiculoObrigatorio.includes(k)} onChange={() => alternaVei(k)} data-testid={`link-veic-${k}`} /> {r}</label>
          ))}
          <small className="muted">Sem porte, vale o preço e a duração do porte médio.</small>
        </fieldset>
      )}
      <Campo rotulo="Até quantos dias à frente o cliente pode marcar" dica="De 1 a 60. A antecedência mínima de cada serviço continua valendo.">
        <select value={cfg.diasMax} onChange={(x) => salvar({ diasMax: Number(x.target.value) }, 'Prazo salvo.')} data-testid="link-dias-max">
          {[7, 14, 30, 45, 60].map((d) => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </Campo>
    </div>
  );
}

// Campos que o botão Atender exige em cada tipo: agendamento futuro (data futura) e atendimento local (agora ou data passada).
function CamposObrigatorios({ e }) {
  const atual = e.camposObrigatorios || CAMPOS_OBRIGATORIOS_PADRAO;
  const alterna = (tipo, k) => {
    const lista = atual[tipo].includes(k) ? atual[tipo].filter((x) => x !== k) : [...atual[tipo], k];
    const r = apiEst.salvar({ camposObrigatorios: { ...atual, [tipo]: lista } });
    if (!r.ok) toast(r.erros[0], 'erro');
  };
  const grupos = [['futuro', 'Agendamento futuro', 'Data e hora no futuro'], ['local', 'Atendimento local', 'Agora ou data que já passou']];
  return (
    <div className="bloco" data-testid="campos-obrigatorios">
      <h3>Campos obrigatórios do botão Atender</h3>
      <p className="muted">Serviço ou produto sempre é obrigatório. Marque o que mais deve ser preenchido em cada tipo. Todos podem ficar desmarcados. Sem telefone o horário fica sem cadastro e sem aviso por WhatsApp.</p>
      <div className="form-grade">
        {grupos.map(([tipo, titulo, dica]) => (
          <fieldset key={tipo} className="conj" data-testid={`obrig-${tipo}`}>
            <legend>{titulo}</legend>
            <small className="muted">{dica}</small>
            {Object.entries(CAMPOS_ATENDER).filter(([k]) => !(tipo === 'futuro' && k === 'formaPagamento') && (capAtiva('usaVeiculo') || !CAMPOS_DE_VEICULO.includes(k))).map(([k, r]) => (
              <label key={k} className="check-linha"><input type="checkbox" checked={atual[tipo].includes(k)} onChange={() => alterna(tipo, k)} data-testid={`obrig-${tipo}-${k}`} /> {r[0].toUpperCase() + r.slice(1)}</label>
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
