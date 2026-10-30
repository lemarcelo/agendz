/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:28da092318 */
import ListaItens from './ListaItens.jsx';
import PickerCliente from './PickerCliente.jsx';
import { porUltimoUso } from '../domain/codigo.js';
import React, { useMemo, useState } from 'react';
import { agenda, agendamentosVisiveis, planos as apiPlanos } from '../services/api.js';
import { rotuloMes as rotuloMesPlano } from '../domain/planos.js';
import { acharClientePorTelefone, CAMPOS_DE_VEICULO, camposObrigatorios, nomeMaisCompleto } from '../domain/engine.js';
import { FORMAS_PAGAMENTO, STATUS, boxesAtivos, duracaoMin, formaEfetiva, formatarTelefone, nomeBox, ocupadoMin, servicoNoPorte, servicosPorIds, telefoneNacional, totalPreco, usaIntegracaoPix } from '../domain/rules.js';
import { EXEMPLO_PORTE, PORTES, PORTE_PADRAO, ROTULO_PORTE, placaValida, rotuloVeiculo } from '../domain/veiculos.js';
import { MIN, fmtDate, fmtDuration, fmtHM, fmtMoney, fromYmd, startOfDay, tsAt, ymd } from '../domain/time.js';
import { Aviso, rolarAoErro, Btn, Campo, Icon, Modal } from './common.jsx';
import { SeletorHora } from './Agendamento.jsx';
import { nomeCliente } from './format.js';
import { toast, useStore } from './hooks.js';
import { capAtiva, Rot, rot } from '../domain/tipos.js';

// Botão único "Atender": atendimento de agora, registro do que já aconteceu (data passada) ou agendamento (data futura).
// O tipo vem da data: sem data = agora; data passada = concluído nessa data; data futura = agendamento (a confirmar ou confirmado).
// Só serviço ou produto é obrigatório sempre; o resto depende de Estabelecimento > Regras > Campos obrigatórios.
export default function Atender({ user, inicial = {}, onClose, onSalvo }) {
  const { state: st, agora } = useStore();
  const ehProfissional = user.papel === 'profissional';
  const profissionais = st.usuarios.filter((u) => u.atende && (!ehProfissional || u.id === user.id));
  const predefinido = inicial.dayTs != null; // veio de um clique no horário vazio da agenda
  const [personalizar, setPersonalizar] = useState(predefinido);
  const [data, setData] = useState(ymd(inicial.dayTs != null ? inicial.dayTs : startOfDay(agora)));
  const [minutos, setMinutos] = useState(() => (inicial.minutos != null ? Math.max(0, Math.min(1430, inicial.minutos)) : new Date(agora).getHours() * 60 + Math.floor(new Date(agora).getMinutes() / 10) * 10));
  const [servicoIds, setServicoIds] = useState([]);
  const [qtds, setQtds] = useState({});
  const [clienteId, setClienteId] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [profissionalId, setProfissionalId] = useState(ehProfissional ? user.id : (profissionais.some((b) => b.id === inicial.profissionalId) ? inicial.profissionalId : profissionais[0]?.id) || '');
  const [vendedorId, setVendedorId] = useState('');
  const [forma, setForma] = useState('');
  const [status, setStatus] = useState(STATUS.A_CONFIRMAR);
  const [chaveCupom, setChaveCupom] = useState('');
  const [encaixe, setEncaixe] = useState(false);
  const [veiculoId, setVeiculoId] = useState(''); // id de um veículo do cliente, 'novo' ou vazio (ainda não escolheu)
  const [vNovo, setVNovo] = useState({ placa: '', marca: '', modelo: '', cor: '', porte: '' });
  const [boxId, setBoxId] = useState('');
  const [erros, setErros] = useState([]);
  const [motivoRetro, setMotivoRetro] = useState('');
  const [semPlano, setSemPlano] = useState(false); // o cliente tem plano, mas esta vez a pessoa quer cobrar normal

  const inicio = personalizar && data ? tsAt(fromYmd(data), minutos) : null;
  const futuro = inicio != null && inicio > agora + 60000;
  const passado = inicio != null && !futuro && inicio < agora - 60000;
  const retro = inicio != null && inicio < startOfDay(agora); // dia anterior ("esqueci de registrar"): pede o motivo
  const tipo = futuro ? 'futuro' : 'local';
  const obrig = camposObrigatorios(st, tipo);
  const pede = (k) => obrig.includes(k);
  const marca = (k) => (pede(k) ? ' *' : '');

  // Últimos usados primeiro (no histórico que este usuário enxerga); quem nunca foi usado vem depois, na ordem do cadastro.
  const visiveis = agendamentosVisiveis(st, user);
  const produtos = porUltimoUso(st.materiais.filter((m) => m.tipo === 'produto' && m.ativo !== false), visiveis, 'produto');
  const servicos = porUltimoUso(st.servicos.filter((s) => s.ativo !== false), visiveis, 'servico');
  const itensProduto = produtos.filter((m) => Number(qtds[m.id]) > 0).map((m) => ({ materialId: m.id, qtd: Number(qtds[m.id]) }));
  const temServico = servicoIds.length > 0;
  const vendeProduto = itensProduto.length > 0;
  const totalProdutos = produtos.reduce((t, m) => t + (Number(qtds[m.id]) > 0 ? Number(qtds[m.id]) * m.preco : 0), 0);

  // Cliente pelo telefone: número já cadastrado traz o nome; número novo cria o cadastro ao registrar.
  const tel = telefoneNacional(telefone);
  const cadastrado = clienteId ? st.clientes.find((c) => c.id === clienteId) : tel.length >= 10 ? acharClientePorTelefone(st.clientes, tel, nome) : null;
  // Veículo: o do cadastro do cliente (se tiver só um, já vem escolhido) ou um novo. O porte dele decide preço e duração de cada serviço.
  const usaVeiculo = capAtiva('usaVeiculo'); // tipo sem veículo (barbearia): nada de veículo, porte nem box
  const veiculosCli = usaVeiculo ? cadastrado?.veiculos || [] : [];
  const veicSel = !usaVeiculo ? '' : !veiculosCli.length ? 'novo' : veiculoId === 'novo' || veiculosCli.some((x) => x.id === veiculoId) ? veiculoId : veiculosCli.length === 1 ? veiculosCli[0].id : '';
  const veicExistente = veiculosCli.find((x) => x.id === veicSel) || null;
  const porteAtual = veicExistente ? veicExistente.porte : veicSel === 'novo' && vNovo.porte ? vNovo.porte : PORTE_PADRAO;
  const porteDefinido = !!veicExistente || (veicSel === 'novo' && !!vNovo.porte);
  const sel = servicosPorIds(st, servicoIds, porteAtual);
  const boxes = capAtiva('usaRecursoFisico') ? boxesAtivos(st) : [];
  // Telefone que já existe no sistema: o cliente encontrado passa a ser o do atendimento (sobrescreve o escolhido na lista) e, se faltar nome, vem o do cadastro.
  const trocaTelefone = (v, nomeAtual = nome) => {
    const f = formatarTelefone(v);
    setTelefone(f);
    const c = acharClientePorTelefone(st.clientes, f, nomeAtual);
    setClienteId(c ? c.id : '');
    if (c && !c.semNome && !nomeAtual.trim()) setNome(c.nome);
  };
  const escolheCliente = (id) => {
    setClienteId(id);
    const c = st.clientes.find((x) => x.id === id);
    if (c) { setNome(c.semNome ? '' : c.nome); setTelefone(formatarTelefone(c.telefone)); }
  };
  // Nome digitado mais completo que o do cadastro: avisa que o cadastro será atualizado.
  const atualizaraNome = cadastrado && !cadastrado.semNome && nome.trim() && nomeMaisCompleto(cadastrado.nome, nome.trim());

  // Plano do cliente (menu Planos): serviço que o plano inclui sai de graça e gasta 1 atendimento do mês; sem atendimento ou sem marcar, cobra pelo preço normal.
  const planoCli = useMemo(() => { const r = cadastrado ? apiPlanos.doCliente(cadastrado.id) : null; return r && r.ok ? r.plano : null; }, [cadastrado?.id, st]); // eslint-disable-line react-hooks/exhaustive-deps
  const cobertos = planoCli ? servicoIds.filter((id) => planoCli.servicoIds.includes(id)) : [];
  const podePlano = !!planoCli && cobertos.length > 0 && (planoCli.restantes > 0 || planoCli.maisPermitidos > 0);
  const usaPlano = podePlano && !semPlano;
  const gratisPlano = usaPlano ? totalPreco(sel.filter((x) => cobertos.includes(x.id))) : 0; // o que o plano paga: o total mostrado já sem isso
  // Vendedor: por padrão quem está lançando (se tem "Pode vender produtos"); senão o profissional. O profissional vende como ele mesmo.
  const vendedores = st.usuarios.filter((u) => u.papel !== 'master' && u.ativo !== false && u.podeVender !== false);
  const euVendo = vendedores.some((u) => u.id === user.id);
  const vendedorEscolhido = vendedorId || (euVendo ? user.id : temServico ? '' : vendedores[0]?.id || '');
  const formaPadrao = formaEfetiva(st, undefined);
  const formaEscolhida = forma || formaPadrao;

  // Horário livre (só agendamento futuro)
  const v = useMemo(() => (futuro && profissionalId && temServico ? agenda.validar({ profissionalId, inicio, servicoIds, porte: porteAtual, boxId: boxId || undefined, encaixe }) : null), [futuro, profissionalId, inicio, servicoIds, porteAtual, boxId, encaixe, temServico, st]);
  const nomeDe = (a) => `${nomeCliente(st, a)} às ${fmtHM(a.inicio)}`;

  const salvar = () => {
    const r = agenda.atender({
      servicoIds, produtos: itensProduto, nome: nome.trim() || undefined, telefone: telefone.trim() || undefined, clienteId: clienteId || undefined,
      profissionalId: profissionalId || undefined, vendedorId: vendeProduto && !ehProfissional && vendedorEscolhido ? vendedorEscolhido : undefined,
      formaPagamento: futuro ? undefined : formaEscolhida || undefined, inicio: inicio != null ? inicio : undefined, motivoRetroativo: retro ? motivoRetro.trim() || undefined : undefined,
      ...(usaPlano ? { assinaturaId: planoCli.assinaturaId } : {}),
      ...(temServico && usaVeiculo ? (veicSel === 'novo' ? { veiculo: vNovo } : veicSel ? { veiculoId: veicSel } : {}) : {}),
      ...(futuro ? { status, encaixe, boxId: boxId || undefined, cupomChave: chaveCupom.trim() || undefined } : {}),
    });
    if (!r.ok) { setErros(r.erros); rolarAoErro(); return; }
    toast(r.tipo === 'futuro' ? 'Agendamento criado.' : 'Atendimento registrado.');
    if (r.plano?.aviso) toast(`Plano ${r.plano.nome}: ${r.plano.aviso}`); // o aviso vem DEPOIS de salvar: nunca atrasa nem bloqueia o agendamento
    onSalvo && onSalvo(r.agendamento, r.tipo);
    onClose();
  };

  const quando = !personalizar ? 'Atendimento de agora, concluído.'
    : futuro ? `Agendamento para ${fmtDate(inicio)} às ${fmtHM(inicio)}.`
      : passado ? `Atendimento que já aconteceu em ${fmtDate(inicio)} às ${fmtHM(inicio)}, registrado como concluído.` : 'Atendimento de agora, concluído.';

  return (
    <Modal titulo="Atender" sub="Serviço ou produto é o único campo obrigatório. A data decide o resto: agora ou passado registra o atendimento; data futura vira agendamento." onClose={onClose} largura={640}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-atender">{futuro ? 'Agendar' : 'Registrar'}</Btn></>}>
      <div className="form-grade">
        <ListaItens titulo="Serviços" testid="atender-lista-servicos" itens={servicos} selecionado={(s) => servicoIds.includes(s.id)} renderItem={(s) => (
          <div key={s.id} className={`servico-linha ${servicoIds.includes(s.id) ? 'on' : ''}`}>
            <label className="servico-op-lado">
              <input type="checkbox" checked={servicoIds.includes(s.id)} onChange={() => setServicoIds((ids) => (ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id]))} data-testid={`atender-srv-${s.id}`} />
              <span><b>{s.nome}</b><small className="muted cod">cód. {s.codigo}{!ehProfissional && (() => { const n = servicoNoPorte(s, porteAtual); return <> · {fmtMoney(n.preco)} · {s.multiDia ? 'vários dias' : fmtDuration(n.duracao)}{s.combo ? ' · combo' : ''}</>; })()}</small></span>
            </label>
          </div>
        )} />
        <div className="campo-largo grupo-hora">
          <div className="campo"><span className="campo-rotulo">Quando</span>
            <div className="linha-campos">
              <button type="button" className={`btn btn-quando${!personalizar ? ' btn-on' : ''}`} aria-pressed={!personalizar} onClick={() => { setPersonalizar(false); setData(ymd(startOfDay(agora))); }} data-testid="atender-agora"><Icon n="clock" size={15} />Agora</button>
              <button type="button" className={`btn btn-quando${personalizar ? ' btn-on' : ''}`} aria-pressed={personalizar} onClick={() => { setPersonalizar(true); setTimeout(() => { const el = document.querySelector('[data-testid="atender-data"]'); try { if (el && el.showPicker) el.showPicker(); } catch { /* o navegador pode recusar sem toque do usuário */ } }, 0); }} data-testid="atender-quando"><Icon n="calendar" size={15} />{personalizar ? 'Data e hora' : 'Escolher data'}</button>
            </div>
            {personalizar && (
              <div className="linha-campos">
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} data-testid="atender-data" aria-label="Data" />
                <SeletorHora valor={minutos} onChange={setMinutos} />
              </div>
            )}
          </div>
          {retro && !ehProfissional && (
            <div className="campo-largo">
              <Campo rotulo="Motivo do lançamento atrasado *">
                <input type="text" maxLength={300} value={motivoRetro} onChange={(e) => setMotivoRetro(e.target.value)} placeholder="Por que não foi registrado na hora? (fica no histórico)" data-testid="atender-motivo-retro" />
              </Campo>
              <p className="muted" data-testid="atender-retro-dica">Se a comissão desse período já foi paga, ela entra no próximo pagamento.</p>
            </div>
          )}
          {retro && ehProfissional && <p className="msg-conflito" data-testid="atender-retro-bloqueado"><Icon n="alert" size={15} /> Lançar um dia anterior é com o proprietário ou a recepção. Peça a eles para registrar.</p>}
          <div className="grupo-hora-avisos" aria-live="polite">
            <p className="muted" data-testid="atender-tipo">{quando}</p>
            {v && v.pendentes.length > 0 && <p className="msg-conflito" data-testid="aviso-pendente"><Icon n="alert" size={15} /> Já há {v.pendentes.length === 1 ? 'um agendamento a confirmar' : `${v.pendentes.length} agendamentos a confirmar`} nesse horário ({v.pendentes.map(nomeDe).join(', ')}).</p>}
            {v && encaixe && v.confirmados.length > 0 && <p className="msg-conflito" data-testid="aviso-confirmado"><Icon n="alert" size={15} /> Encaixe sobre horário já confirmado ({v.confirmados.map(nomeDe).join(', ')}).</p>}
            {v && v.erros.map((e) => <p key={e} className="msg-conflito" data-testid="erro-horario"><Icon n="alert" size={15} /> {e}</p>)}
            {v && !v.erros.length && !v.pendentes.length && <p className="msg-ok"><Icon n="check" size={15} /> Horário livre · {v.retirada && v.dias > 1 ? `entrada ${fmtDate(inicio)} ${fmtHM(inicio)}, retirada prevista ${fmtDate(v.retirada)} ${fmtHM(v.retirada)} (${v.dias} dias)` : `${fmtHM(inicio)} às ${fmtHM(v.retirada || inicio + (v.duracao || 0) * MIN)}`}{v.boxId ? ` · ${nomeBox(st, v.boxId)}` : ''}</p>}
          </div>
        </div>
        {planoCli && (
          <div className="campo-largo subcartao" data-testid="atender-plano">
            <b><Icon n="ticket" size={15} /> Plano {planoCli.plano}</b>
            <span className="muted" data-testid="atender-plano-saldo">Restam {planoCli.restantes} atendimento{planoCli.restantes === 1 ? '' : 's'} em {rotuloMesPlano(planoCli.mes)}{planoCli.restantes <= 0 && planoCli.maisPermitidos > 0 ? ` · pode adiantar ${planoCli.maisPermitidos}` : ''}{planoCli.atrasado ? ' · mensalidade do mês ainda não registrada' : ''}.</span>
            {cobertos.length === 0 && <span className="muted">Escolha um serviço que o plano inclui para usar o plano.</span>}
            {cobertos.length > 0 && !podePlano && <span className="msg-conflito" data-testid="atender-plano-esgotado"><Icon n="alert" size={15} /> Os atendimentos do plano acabaram: este atendimento será cobrado pelo preço normal.</span>}
            {podePlano && <label className="interruptor"><input type="checkbox" checked={!semPlano} onChange={(e) => setSemPlano(!e.target.checked)} data-testid="atender-usar-plano" /><span className="trilho"><i className="bolinha" /></span><span className="interruptor-txt"><b>Usar o plano neste atendimento</b><small className="muted">Os serviços do plano saem de graça; o resto é cobrado normalmente.</small></span></label>}
          </div>
        )}
        {produtos.length > 0 && (
          <ListaItens titulo="Produtos" testid="atender-lista-produtos" itens={produtos} selecionado={(m) => Number(qtds[m.id]) > 0} renderItem={(m) => (
            <div key={m.id} className={`servico-linha ${Number(qtds[m.id]) > 0 ? 'on' : ''}`}>
              <span className="servico-op-lado"><span><b>{m.nome}</b><small className="muted cod">cód. {m.codigo} · {fmtMoney(m.preco)} · restam {m.estoque}</small></span></span>
              <input type="number" min="0" max="999" step="1" placeholder="0" value={qtds[m.id] ?? ''} onChange={(e) => setQtds({ ...qtds, [m.id]: e.target.value })} aria-label={`Quantidade de ${m.nome}`} style={{ maxWidth: 80 }} data-testid={`atender-prod-${m.id}`} />
            </div>
          )} />
        )}

        {!ehProfissional && <PickerCliente clientes={st.clientes} valor={clienteId} onEscolher={escolheCliente} onLimpar={() => setClienteId('')} />}
        <Campo rotulo={`Nome${marca('nome')}`}><input value={nome} onChange={(e) => { setNome(e.target.value); if (clienteId && !(tel.length >= 10)) setClienteId(''); }} maxLength={60} placeholder="Nome ou apelido" data-testid="atender-nome" /></Campo>
        <Campo rotulo={`Telefone${pede('telefone') || futuro ? ' *' : ''}`} dica={cadastrado ? undefined : tel.length >= 10 ? 'Número novo: o cadastro do cliente é criado ao registrar.' : futuro ? 'O aviso do horário vai por WhatsApp.' : 'Com o telefone, o cliente fica cadastrado para a próxima vez.'}>
          <input value={telefone} inputMode="tel" autoComplete="off" onChange={(e) => trocaTelefone(e.target.value, nome)} placeholder="(55) 99999-9999" data-testid="atender-telefone" />
          {cadastrado && <span className="msg-ok" data-testid="atender-vinculo">Cliente cadastrado: {cadastrado.semNome ? formatarTelefone(cadastrado.telefone) : cadastrado.apelido || cadastrado.nome}.{atualizaraNome ? ` O nome no cadastro será atualizado para “${nome.trim()}”.` : ''}</span>}
        </Campo>
        {temServico && usaVeiculo && (
          <fieldset className="campo-largo conj" data-testid="atender-veiculo">
            <legend>Veículo{obrig.some((k) => CAMPOS_DE_VEICULO.includes(k)) ? ' *' : ''}</legend>
            {veiculosCli.length > 0 && (
              <Campo rotulo="Veículo do cliente">
                <select value={veicSel} onChange={(e) => setVeiculoId(e.target.value)} data-testid="atender-veiculo-sel">
                  {!veicSel && <option value="">Escolha o veículo…</option>}
                  {veiculosCli.map((x) => <option key={x.id} value={x.id}>{rotuloVeiculo(x)} · {ROTULO_PORTE[x.porte]}</option>)}
                  <option value="novo">Outro veículo (novo)</option>
                </select>
              </Campo>
            )}
            {veicSel === 'novo' && (
              <div className="form-grade">
                <Campo rotulo={`Placa${obrig.includes('placa') ? ' *' : ''}`} erro={vNovo.placa && !placaValida(vNovo.placa) ? 'Placa inválida (ABC-1234 ou ABC1D23).' : undefined}><input value={vNovo.placa} onChange={(e) => setVNovo({ ...vNovo, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) })} maxLength={8} autoComplete="off" placeholder="ABC1D23" data-testid="atender-placa" /></Campo>
                <Campo rotulo={`Modelo${obrig.includes('modelo') ? ' *' : ''}`}><input value={vNovo.modelo} onChange={(e) => setVNovo({ ...vNovo, modelo: e.target.value })} maxLength={40} autoComplete="off" placeholder="Ex.: Onix" data-testid="atender-modelo" /></Campo>
                <Campo rotulo="Marca (opcional)"><input value={vNovo.marca} onChange={(e) => setVNovo({ ...vNovo, marca: e.target.value })} maxLength={30} autoComplete="off" data-testid="atender-marca" /></Campo>
                <Campo rotulo="Cor (opcional)"><input value={vNovo.cor} onChange={(e) => setVNovo({ ...vNovo, cor: e.target.value })} maxLength={20} autoComplete="off" data-testid="atender-cor" /></Campo>
                <Campo rotulo={`Porte${obrig.includes('porte') ? ' *' : ''}`} className="campo-largo" dica={vNovo.porte ? EXEMPLO_PORTE[vNovo.porte] : 'O porte define o preço e a duração dos serviços. Sem porte vale o médio.'}>
                  <select value={vNovo.porte} onChange={(e) => setVNovo({ ...vNovo, porte: e.target.value })} data-testid="atender-porte">
                    <option value="">{obrig.includes('porte') ? 'Escolha…' : 'Médio (padrão)'}</option>
                    {PORTES.map((k) => <option key={k} value={k}>{ROTULO_PORTE[k]}</option>)}
                  </select>
                </Campo>
              </div>
            )}
            {porteDefinido && <p className="muted" data-testid="atender-porte-info">Preços e tempos do porte {ROTULO_PORTE[porteAtual].toLowerCase()}.</p>}
          </fieldset>
        )}
        <Campo rotulo={`${Rot('profissional')}${marca('profissional')}`}>
          <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)} disabled={ehProfissional} data-testid="atender-profissional">
            {profissionais.map((b) => <option key={b.id} value={b.id}>{b.apelido || b.nome}</option>)}
          </select>
        </Campo>
        {futuro && temServico && boxes.length > 0 && (
          <Campo rotulo="Box" dica={v && v.boxId ? `Vai para o ${nomeBox(st, v.boxId)}.` : 'Automático: o app escolhe um box livre.'}>
            <select value={boxId} onChange={(e) => setBoxId(e.target.value)} data-testid="atender-box">
              <option value="">Automático</option>
              {boxes.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </Campo>
        )}
        {vendeProduto && !ehProfissional && (
          <Campo rotulo={`${temServico ? 'Vendedor dos produtos' : 'Vendedor'}${marca('vendedor')}`} dica="Quem vendeu ganha a comissão do produto, se o produto tiver.">
            <select value={vendedorEscolhido} onChange={(e) => setVendedorId(e.target.value)} data-testid="atender-vendedor">
              {!euVendo && temServico && <option value="">O {rot('profissional')} do atendimento</option>}
              {vendedores.map((u) => <option key={u.id} value={u.id}>{u.apelido || u.nome}{u.id === user.id ? ' (eu)' : ''}</option>)}
            </select>
          </Campo>
        )}
        {!futuro && (
          <Campo rotulo={`Forma de pagamento${marca('formaPagamento')}`} dica={formaEscolhida === 'pix' && !usaIntegracaoPix(st) ? 'Pix só como registro: sem cobrança nem QR neste estabelecimento.' : 'O valor entra no financeiro na conta desta forma.'}>
            <select value={formaEscolhida} onChange={(e) => setForma(e.target.value)} data-testid="atender-forma">
              {!formaPadrao && <option value="">Escolha…</option>}
              {Object.entries(FORMAS_PAGAMENTO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </Campo>
        )}
        {futuro && (
          <>
            <fieldset className="campo-largo conj">
              <legend>Situação do agendamento</legend>
              <div className="radios">
                {[[STATUS.A_CONFIRMAR, 'A confirmar'], [STATUS.CONFIRMADO, 'Confirmado']].map(([k, r]) => (
                  <label key={k} className={`radio-op ${status === k ? 'on' : ''}`}><input type="radio" name="atender-status" checked={status === k} onChange={() => setStatus(k)} data-testid={`atender-status-${k}`} />{r}</label>
                ))}
              </div>
              <p className="muted dica-status">{status === STATUS.A_CONFIRMAR ? 'O cliente recebe a pergunta de confirmação pelo WhatsApp, conforme as notificações configuradas.' : 'Nenhuma mensagem é enviada ao cliente.'}</p>
            </fieldset>
            <Campo rotulo="Cupom ou vale (chave, opcional)"><input value={chaveCupom} maxLength={20} autoComplete="off" onChange={(e) => setChaveCupom(e.target.value)} placeholder="XXXX-XXXX-XXXX" data-testid="atender-cupom" /></Campo>
            <label className="encaixe-op campo-largo">
              <input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} data-testid="atender-encaixe" />
              <span><b>Encaixe</b><small className="muted">Força o horário mesmo sobre outro agendamento (inclusive confirmado). Só vale pelo painel.</small></span>
            </label>
          </>
        )}
        {(temServico || vendeProduto) && !ehProfissional && (
          <p className="muted campo-largo" data-testid="atender-total">
            Total: {fmtMoney(totalPreco(sel) + totalProdutos - gratisPlano)}{gratisPlano > 0 ? ` (o plano cobre ${fmtMoney(gratisPlano)})` : ''}{temServico ? (sel.some((x) => x.multiDia) ? ' · serviço de vários dias' : ` · ${fmtDuration(duracaoMin(sel))} de atendimento (+ ${fmtDuration(ocupadoMin(sel) - duracaoMin(sel))} de intervalo)`) : ''}
          </p>
        )}
      </div>
      {erros.length > 0 && <Aviso tipo="erro">{erros.map((e) => <div key={e}>{e}</div>)}</Aviso>}
    </Modal>
  );
}
