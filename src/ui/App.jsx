/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:a6fe1e7410 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { LOJA_NAO_ENCONTRADA, MODO_DEMO, auth, avisosDoUsuario, equipe, naoLidasDoSuporte, store, suporte } from '../services/api.js';
import { lerHashAgendar } from '../domain/link-publico.js';
import { criarAdaptadorDemo } from '../services/onboarding-demo.js';
import PrimeiroAcesso from './leve/PrimeiroAcesso.jsx';
import Suporte from './leve/Suporte.jsx';
import { ehDono, ehGestor, papelRotulo, pode } from '../domain/rules.js';
import { iconeServicosAtivo, temaPadraoAtivo, tipoDe } from '../domain/tipos.js';
import Agenda from './Agenda.jsx';
import { FormAgendamento, GavetaAgendamento } from './Agendamento.jsx';
import Atender from './Atender.jsx';
import { Avisos, Clientes, Equipe, MinhaEscala, Modelos, Servicos } from './Cadastros.jsx';
import { Aviso, Avatar, Btn, Campo, Icon, Modal } from './common.jsx';
import Estabelecimento from './Estabelecimento.jsx';
import Estoque from './Estoque.jsx';
import Financeiro from './Financeiro.jsx';
import Relatorios, { RelatorioProfissional } from './Relatorios.jsx';
import Login from './Login.jsx';
import { LogoMarca, RodapePlataforma, TemaMarca } from './Marca.jsx';
import { PainelWhats } from './Whats.jsx';
import AgendarPublico from './AgendarPublico.jsx';
import { toast, useLocal, useMedia, useStore, useToasts, useUser } from './hooks.js';
import { restaurarOrdens, useOrdem, useTemOrdemPersonalizada } from './ordem.jsx';

// Adaptador do Suporte para a API simulada (o do site real usa api-real.js): mesmas chamadas, sempre assíncronas.
const adaptadorSuporte = {
  listar: async () => suporte.listar(),
  abrir: async (d) => { const r = suporte.abrir(d); return r.ok ? r : { ok: false, erro: (r.erros || [])[0] || 'Não foi possível abrir o chamado.' }; },
  obter: async (id) => { const r = suporte.obter(id); return r.ok ? r : { ok: false, erro: (r.erros || [])[0] || 'Chamado não encontrado.' }; },
  responder: async (id, t) => { const r = suporte.responder(id, t); return r.ok ? r : { ok: false, erro: (r.erros || [])[0] || 'Não foi possível enviar.' }; },
};

function AlterarSenha({ onClose }) {
  const [a, setA] = useState('');
  const [n, setN] = useState('');
  const [erro, setErro] = useState('');
  const salvar = () => { const r = equipe.alterarSenha(a, n); if (!r.ok) { setErro(r.erros[0]); return; } toast('Senha alterada.'); onClose(); };
  return (
    <Modal titulo="Alterar senha" onClose={onClose} largura={420} rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar}>Salvar</Btn></>}>
      <div className="form-grade um">
        <Campo rotulo="Senha atual"><input type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete="current-password" /></Campo>
        <Campo rotulo="Nova senha"><input type="password" value={n} onChange={(e) => setN(e.target.value)} autoComplete="new-password" /></Campo>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

function Toasts() {
  const ts = useToasts();
  return <div className="toasts" aria-live="polite">{ts.map((t) => <div key={t.id} className={`toast toast-${t.tipo}`}>{t.tipo === 'erro' ? <Icon n="alert" size={16} /> : <Icon n="check" size={16} />}{t.texto}</div>)}</div>;
}

// Link de agendamento do cliente: #agendar (qualquer profissional) ou #agendar-<id do profissional>. Só letras, números e hífen: vale também dentro do Artifact.
const lerHash = () => { try { return window.location.hash || ''; } catch { return ''; } };
function useHash() {
  const [h, setH] = useState(lerHash);
  useEffect(() => { const f = () => setH(lerHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}

// Tema: o padrão depende do tipo (catálogo, `visual.temaPadrao`). 'escuro': escuro por padrão, o claro é escolha do usuário e não segue o sistema.
// 'auto': segue o sistema e o usuário alterna automático → escuro → claro. Gravado no aparelho; vale também para o login e o link do cliente.
function useTema() {
  const auto = temaPadraoAtivo() === 'auto';
  const [salvo, setTema] = useLocal(auto ? 'tema-auto' : 'tema', auto ? 'auto' : 'dark');
  const tema = auto ? (['auto', 'dark', 'light'].includes(salvo) ? salvo : 'auto') : salvo === 'light' ? 'light' : 'dark';
  useEffect(() => {
    const r = document.documentElement;
    if (tema === 'light') r.setAttribute('data-theme', 'light'); else if (auto && tema === 'dark') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }, [tema, auto]);
  return [tema, setTema];
}

function LojaNaoEncontrada({ slug }) {
  return <main className="login" data-testid="loja-nao-encontrada"><div className="login-cartao"><h1>Loja não encontrada</h1><p className="muted">O endereço usado não aponta para nenhuma loja do Agendz{slug ? ` (“${slug}”)` : ''}. Confira o link com o estabelecimento.</p><RodapePlataforma /></div></main>;
}

// Endereço que pede uma loja inexistente nunca cai numa loja padrão: não mostra dado de ninguém.
export default function App() { return LOJA_NAO_ENCONTRADA ? <LojaNaoEncontrada slug={LOJA_NAO_ENCONTRADA} /> : <AppDaLoja />; }

// Pré-visualização do assistente de primeiro acesso (só na demonstração; nada é gravado). Link na tela de entrada: #primeiro-acesso.
function PreviaPrimeiroAcesso({ st }) {
  const adaptador = React.useMemo(() => criarAdaptadorDemo(), []);
  return <PrimeiroAcesso tipo={tipoDe(st.estabelecimento)} nomeLoja={st.estabelecimento.nome} adaptador={adaptador} previa aoConcluir={() => { window.location.hash = ''; }} />;
}

function AppDaLoja() {
  const { state: st, sessao } = useStore();
  const tipo = tipoDe(st.estabelecimento);
  useEffect(() => { document.documentElement.setAttribute('data-tipo', tipo); }, [tipo]); // o CSS escolhe a identidade visual do tipo (src/tipos/<tipo>/tema.css)
  const user = useUser();
  const hash = useHash();
  const [tema, setTema] = useTema();
  const publica = lerHashAgendar(hash);
  // Demonstração: o link traz a loja de quem enviou (#agendar@dalforno); `entrarNaLoja` só age sem loja fixa por build ou endereço.
  useLayoutEffect(() => { if (MODO_DEMO && publica?.loja) store.entrarNaLoja(publica.loja); }, [publica?.loja]);
  if (MODO_DEMO && hash === '#primeiro-acesso') return <><TemaMarca /><PreviaPrimeiroAcesso st={st} /></>;
  if (publica) return <><TemaMarca /><AgendarPublico key={st.estabelecimento.nome} profissionalInicial={publica.profissionalId} logado={!!user} aoVoltar={() => { window.location.hash = ''; }} /></>;
  if (!user) return <><TemaMarca /><Login /><Toasts /></>;
  return <><TemaMarca /><Shell user={user} st={st} tema={tema} setTema={setTema} /></>;
}

function Shell({ user, st, tema, setTema }) {
  const [aba, setAba] = useState('agenda');
  const [abrirId, setAbrirId] = useState(null);
  const [form, setForm] = useState(null);
  const [dockPref, setDockPref] = useLocal('wa-aberto', null);
  const [senha, setSenha] = useState(false);
  const largo = useMedia('(min-width: 1320px)');

  const avisos = avisosDoUsuario(st, user).filter((a) => !a.lido).length;
  const chamadosNovos = naoLidasDoSuporte(st, user);
  const itens = [
    pode(user, 'agenda') && ['agenda', 'Agenda', 'calendar'],
    pode(user, 'clientes') && ['clientes', 'Clientes', 'users'],
    pode(user, 'servicos') && ['servicos', 'Serviços', iconeServicosAtivo()],
    pode(user, 'relatorios') && ['relatorios', 'Relatórios', 'list'],
    ehGestor(user) && ['ganhos', 'Meus ganhos', 'wallet'],
    pode(user, 'estoque') && ['estoque', 'Estoque', 'box'],
    pode(user, 'financeiro') && ['financeiro', 'Financeiro', 'wallet'],
    pode(user, 'estabelecimento') && ['estab', 'Estabelecimento', 'store'],
    ehDono(user) && ['equipe', 'Equipe', 'team'],
    user.papel === 'profissional' && ['escala', 'Minha escala', 'clock'],
    ['mensagens', 'Mensagens', 'msg'],
    pode(user, 'agenda') && ['avisos', 'Avisos', 'bell'],
    ['suporte', 'Suporte', 'info'],
  ].filter(Boolean);
  const abaAtual = itens.some((i) => i[0] === aba) ? aba : itens[0][0];
  // O simulador de WhatsApp (conversa com o robô da loja) existe SÓ na tela Mensagens: nas outras telas nem o painel nem o botão aparecem.
  const naTelaMensagens = abaAtual === 'mensagens';
  const dockAberto = naTelaMensagens && (dockPref === null ? largo : dockPref);
  // Menu: segurar e arrastar muda a ordem (salva por usuário). Itens sem permissão nem aparecem; os novos entram no fim.
  const ordemMenu = useOrdem('nav', itens.map((i) => i[0]), { eixo: 'x', rotulo: (id) => itens.find((i) => i[0] === id)?.[1] ?? id });
  const itensOrdenados = ordemMenu.ids.map((id) => itens.find((i) => i[0] === id)).filter(Boolean);
  const temOrdem = useTemOrdemPersonalizada();

  const abrir = (id) => { setAbrirId(id); };
  const novo = (pre) => setForm({ inicial: pre });

  return (
    <div className={`app ${dockAberto ? 'com-dock' : ''}`}>
      <header className="topo">
        <div className="topo-marca"><LogoMarca comNome /></div>
        <nav className="nav" aria-label="Seções">
          {itensOrdenados.map(([k, r, ic]) => (
            <button key={k} type="button" className={`${abaAtual === k ? 'on' : ''} ${ordemMenu.classe(k)}`.trim()} {...ordemMenu.props(k)} onClick={() => setAba(k)} aria-current={abaAtual === k ? "page" : undefined} title={r} data-testid={`nav-${k}`}>
              <Icon n={ic} size={17} /><span>{r}</span>{k === 'avisos' && avisos > 0 && <i className="badge" data-testid="badge-avisos">{avisos}</i>}{k === 'suporte' && chamadosNovos > 0 && <i className="badge" data-testid="badge-suporte">{chamadosNovos}</i>}
            </button>
          ))}
        </nav>
        <div className="topo-dir">
          <button type="button" className="icone-btn" onClick={() => setTema(temaPadraoAtivo() === 'auto' ? (tema === 'dark' ? 'light' : tema === 'light' ? 'auto' : 'dark') : (tema === 'dark' ? 'light' : 'dark'))} aria-label={temaPadraoAtivo() === 'auto' ? `Tema: ${tema === 'auto' ? 'automático' : tema === 'dark' ? 'escuro' : 'claro'}. Alternar` : `Tema ${tema === 'dark' ? 'escuro' : 'claro'}. Alternar para o ${tema === 'dark' ? 'claro' : 'escuro'}`} data-testid="alternar-tema" title="Alternar tema"><Icon n={tema === 'dark' ? 'moon' : 'sun'} /></button>
          {temOrdem && <button type="button" className="icone-btn" onClick={() => { restaurarOrdens(user.id); toast('Ordem padrão restaurada em menus, abas, colunas e marcadores.'); }} aria-label="Restaurar a ordem padrão de menus, abas, colunas e marcadores" title="Restaurar a ordem padrão de menus, abas, colunas e marcadores" data-testid="ordem-restaurar"><Icon n="reset" size={17} /></button>}
          <div className="usuario">
            <Avatar nome={user.apelido || user.nome} foto={user.foto} chave={user.id} />
            <div className="usuario-txt"><b>{user.apelido || user.nome}</b><small>{papelRotulo(user)}</small></div>
            <button type="button" className="icone-btn" onClick={() => setSenha(true)} aria-label="Alterar senha" title="Alterar senha"><Icon n="key" size={17} /></button>
            <button type="button" className="icone-btn" onClick={() => auth.logout()} aria-label="Sair" title="Sair" data-testid="sair"><Icon n="logout" size={17} /></button>
          </div>
        </div>
      </header>

      <div className="corpo">
        <main className="principal">
          {abaAtual === 'agenda' && <Agenda user={user} onAbrir={abrir} onNovo={novo} />}
          {abaAtual === 'clientes' && <Clientes user={user} />}
          {abaAtual === 'servicos' && <Servicos user={user} />}
          {abaAtual === 'relatorios' && <Relatorios user={user} />}
          {abaAtual === 'ganhos' && <RelatorioProfissional />}
          {abaAtual === 'estoque' && <Estoque user={user} />}
          {abaAtual === 'financeiro' && <Financeiro user={user} />}
          {abaAtual === 'estab' && <Estabelecimento user={user} />}
          {abaAtual === 'equipe' && <Equipe user={user} />}
          {abaAtual === 'escala' && <MinhaEscala user={user} />}
          {abaAtual === 'mensagens' && <Modelos user={user} />}
          {abaAtual === 'avisos' && <Avisos user={user} onAbrir={abrir} />}
          {abaAtual === 'suporte' && <Suporte adaptador={adaptadorSuporte} ehDono={ehDono(user)} />}
        </main>
        {dockAberto && <div className="dock"><PainelWhats onFechar={() => setDockPref(false)} /></div>}
      </div>

      {naTelaMensagens && !dockAberto && (
        <button type="button" className="bolha-whats" onClick={() => setDockPref(true)} aria-label="Abrir simulador de WhatsApp" data-testid="abrir-whats">
          <Icon n="msg" size={22} /><span>Simular WhatsApp</span>
        </button>
      )}

      {abrirId && <GavetaAgendamento id={abrirId} user={user} onClose={() => setAbrirId(null)} onRemarcar={(id) => { setForm({ remarcarId: id }); }} />}
      {form && form.remarcarId && <FormAgendamento user={user} remarcarId={form.remarcarId} onClose={() => setForm(null)} />}
      {form && !form.remarcarId && <Atender user={user} inicial={form.inicial} onClose={() => setForm(null)} onSalvo={() => setAbrirId(null)} />}
      {senha && <AlterarSenha onClose={() => setSenha(false)} />}
      <Toasts />
    </div>
  );
}
