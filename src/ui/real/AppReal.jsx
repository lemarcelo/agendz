/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Casca do site publicado (API real), F2: carrega a loja do endereço (GET /api/publico/loja), faz o login real, troca a senha
// temporária e mostra o painel com o menu. Os módulos entram um a um (Clientes na parte 2, Serviços na 3, Equipe na 4; a agenda na seguinte), cada um só
// quando o servidor tem a regra inteira. Não importa `api.js` (a simulada) nem `hooks.js`: o estado aqui é só o da sessão real, em memória.
import React, { useEffect, useMemo, useState } from 'react';
import { cancelarEspera, carregarLoja, entrar, esperandoRede, loginValido, onboarding, passkey, perfil as apiPerfil, quandoEsperar, sair, sessaoAtual, suporte as apiSuporte, trocarSenha } from '../../services/api-real.js';
import PrimeiroAcesso from '../leve/PrimeiroAcesso.jsx';
import Agenda from './Agenda.jsx';
import Clientes from './Clientes.jsx';
import Servicos from './Servicos.jsx';
import Equipe from './Equipe.jsx';
import Boxes from './Boxes.jsx';
import Comissoes from './Comissoes.jsx';
import Relatorios from './Relatorios.jsx';
import Estoque from './Estoque.jsx';
import Estabelecimento from './Estabelecimento.jsx';
import Ganhos from './Ganhos.jsx';
import RegrasAtendimento from './RegrasAtendimento.jsx';
import Cupons from './Cupons.jsx';
import AgendarPublico from './AgendarPublico.jsx';
import LinkAgendamento from './LinkAgendamento.jsx';
import Avisos from './Avisos.jsx';
import Suporte from '../leve/Suporte.jsx';
import { useAtualizacaoAutomatica } from './atualizar.js';
import AlertaAgenda from './AlertaAgenda.jsx';
import MeuPerfil, { AvatarReal } from './MeuPerfil.jsx';
import { lerPrefs } from './alerta.js';
import { DESTAQUE_MS, podarDestaques } from '../../domain/notificacao.js';
import { TIPOS, capAtiva, definirTipoAtivo, rotulo, tipoValido } from '../../domain/tipos.js';
import { cssDaMarca, logoValida } from '../../domain/tema.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

// Faixa fixa no alto: a ação foi pedida mas o aparelho está sem internet; ela é enviada sozinha quando a conexão voltar (ou cancelada aqui).
function AvisoRede() {
  const [esperando, setEsperando] = useState(esperandoRede());
  useEffect(() => { quandoEsperar(setEsperando); return () => quandoEsperar(null); }, []);
  if (!esperando) return null;
  return (
    <div className="faixa-rede" role="status" data-testid="aviso-rede">
      <span>Sem conexão com a internet. Sua ação será enviada assim que a conexão voltar.</span>
      <button type="button" className="btn pequeno" onClick={cancelarEspera} data-testid="rede-cancelar">Cancelar</button>
    </div>
  );
}

function Marca({ loja }) {
  const tipo = TIPOS[loja.tipo];
  return (
    <div className="login-marca">
      {logoValida(loja.logo)
        ? <img className="marca-logo" src={loja.logo} alt="" width={56} height={56} data-testid="logo-marca" />
        : <span className="marca-icone" data-testid="marca-icone"><Icone n={tipo.visual.iconeMarca} size={24} /></span>}
      <div><h1>{loja.nome}</h1><p className="muted">Painel de agendamentos</p></div>
    </div>
  );
}

function Cartao({ loja, children }) {
  return <main className="login"><div className="login-cartao">{loja && <Marca loja={loja} />}{children}</div><p className="rodape-plataforma">Agendz</p></main>;
}

function Login({ loja, aoEntrar }) {
  const [id, setId] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [esqueci, setEsqueci] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await entrar({ identificador: id, senha });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); setSenha(''); return; }
    aoEntrar(r.sessao, r.sessao.deveTrocarSenha ? senha : '');
  };
  // Entrar com a digital: o aparelho assina, o servidor confere; a sessão é a mesma do login por senha.
  const entrarComDigital = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await passkey.entrar();
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoEntrar(r.sessao, '');
  };
  return (
    <Cartao loja={loja}>
      <form onSubmit={enviar} className="form-grade um">
        <Campo rotulo="Usuário"><input value={id} onChange={(e) => { setId(e.target.value); setErro(''); }} autoComplete="username" autoFocus maxLength={60} data-testid="login-id" /></Campo>
        <Campo rotulo="Senha"><input type="password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }} autoComplete="current-password" maxLength={100} data-testid="login-senha" /></Campo>
        {erro && <Aviso tipo="erro" data-testid="login-erro">{erro}</Aviso>}
        <Btn variante="primario" type="submit" disabled={enviando} data-testid="login-entrar">{enviando ? 'Entrando…' : 'Entrar'}</Btn>
        {passkey.disponivel() && <Btn type="button" disabled={enviando} onClick={entrarComDigital} data-testid="login-digital">Entrar com a digital</Btn>}
        <button type="button" className="link" onClick={() => setEsqueci(!esqueci)} aria-expanded={esqueci} data-testid="login-esqueci">Esqueci minha senha</button>
        {esqueci && <Aviso data-testid="login-esqueci-texto">Ainda não há e-mail nem WhatsApp configurado para recuperar a senha. Peça ao suporte do Agendz para redefinir: você recebe uma senha temporária e escolhe a sua no primeiro acesso.</Aviso>}
      </form>
    </Cartao>
  );
}

// Primeiro acesso: a pessoa já entrou com o usuário e a senha que recebeu; aqui só redefine (usuário que ela escolhe + senha nova). A senha enviada vem da
// tela de entrada e fica só em memória até a troca (nunca vai ao storage); depois de salvar a sessão já é a nova e a tela segue sozinha (assistente ou agenda).
function TrocarSenha({ loja, sessao, senhaEnviada, aoTrocar, aoSair }) {
  const [f, setF] = useState({ atual: '', usuario: '', nova: '', repetir: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mudar = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErro(''); };
  const precisaAtual = !senhaEnviada; // só se a senha enviada não estiver em memória
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    const usuario = f.usuario.trim().toLowerCase();
    if (!loginValido(usuario)) { setErro('Escolha o seu usuário: de 2 a 60 caracteres, só letras, números, ponto, hífen e sublinhado'); return; }
    if (f.nova !== f.repetir) { setErro('A confirmação da nova senha não confere'); return; }
    setEnviando(true); setErro('');
    const r = await trocarSenha({ senhaAtual: senhaEnviada || f.atual, nova: f.nova, usuario });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoTrocar(r.sessao);
  };
  return (
    <Cartao loja={loja}>
      <form onSubmit={enviar} className="form-grade um">
        <p><b>Olá, {sessao.nome}.</b> Sua senha é temporária. Escolha o seu usuário e a sua senha definitiva: depois disso você já entra e segue para a configuração.</p>
        {precisaAtual && <Campo rotulo="Senha temporária (a que você recebeu)"><input type="password" value={f.atual} onChange={mudar('atual')} autoComplete="current-password" autoFocus maxLength={100} data-testid="troca-atual" /></Campo>}
        <Campo rotulo="Seu usuário (você escolhe; letras, números, ponto, hífen)"><input value={f.usuario} onChange={mudar('usuario')} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={60} autoFocus={!precisaAtual} data-testid="troca-usuario" /></Campo>
        <Campo rotulo="Sua senha definitiva (8 caracteres ou mais)"><input type="password" value={f.nova} onChange={mudar('nova')} autoComplete="new-password" maxLength={100} data-testid="troca-nova" /></Campo>
        <Campo rotulo="Repita a senha definitiva"><input type="password" value={f.repetir} onChange={mudar('repetir')} autoComplete="new-password" maxLength={100} data-testid="troca-repetir" /></Campo>
        {erro && <Aviso tipo="erro" data-testid="troca-erro">{erro}</Aviso>}
        <p className="muted" data-testid="troca-esqueci">Esqueceu a senha depois? Quando o e-mail ou o WhatsApp da loja estiver configurado, dá para redefinir por lá. Até lá, peça ao suporte do Agendz, que redefine para você.</p>
        <Btn variante="primario" type="submit" disabled={enviando} data-testid="troca-salvar">{enviando ? 'Salvando…' : 'Salvar e continuar'}</Btn>
        <button type="button" className="link" onClick={aoSair} data-testid="troca-sair">Sair</button>
      </form>
    </Cartao>
  );
}

function LogoPequena({ loja }) {
  const tipo = TIPOS[loja.tipo];
  return (
    <div className="topo-marca">
      {logoValida(loja.logo) ? <img className="marca-logo" src={loja.logo} alt="" width={32} height={32} /> : <span className="marca-icone"><Icone n={tipo.visual.iconeMarca} size={18} /></span>}
      <span className="marca-nome">{loja.nome}</span>
    </div>
  );
}

// Área logada: menu com as telas que já existem no site real. Telas que ainda não chegaram não aparecem (nada de botão morto).
function Painel({ loja, sessao, aoSair }) {
  // Depois de entrar (e de concluir o assistente) a pessoa cai na Agenda, que é o que ela usa todo dia; quem não tem a agenda abre a primeira tela do menu.
  const [aba, setAba] = useState(() => (sessao.papel === 'dono' || (sessao.secoes || []).includes('agenda') ? 'agenda' : (sessao.secoes || []).includes('clientes') ? 'clientes' : 'servicos'));
  const [reconfigurando, setReconfigurando] = useState(false);
  // Meu perfil e aviso de agendamento novo: as escolhas de aviso ficam neste aparelho; o cartão novo pulsa na agenda por alguns segundos.
  const [meus, setMeus] = useState(null);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [prefs, setPrefs] = useState(() => lerPrefs(loja.slug, sessao.id));
  const [destaques, setDestaques] = useState({});
  const [foco, setFoco] = useState(null);
  const [recarregar, setRecarregar] = useState(0);
  useEffect(() => { apiPerfil.obter().then((r) => { if (r.ok) setMeus(r.dados); }); }, []);
  // Selo do Suporte: respostas novas da equipe da plataforma (consulta de fundo; se falhar, o selo só não muda).
  const [chamadosNovos, setChamadosNovos] = useState(0);
  const lerChamadosNovos = () => { apiSuporte.naoLidas().then((r) => { if (r.ok) setChamadosNovos(r.naoLidas); }); };
  useEffect(lerChamadosNovos, []);
  useAtualizacaoAutomatica(lerChamadosNovos);
  useEffect(() => {
    const ate = Object.values(destaques);
    if (!ate.length) return undefined;
    const t = setTimeout(() => setDestaques((d) => podarDestaques(d, Date.now())), Math.max(50, Math.min(...ate) - Date.now() + 50));
    return () => clearTimeout(t);
  }, [destaques]);
  const destacar = (ids) => {
    if (!ids.length) return;
    const ate = Date.now() + DESTAQUE_MS;
    setDestaques((d) => ({ ...d, ...Object.fromEntries(ids.map((id) => [id, ate])) }));
    setRecarregar((n) => n + 1); // a agenda busca já o agendamento novo, sem esperar os 20 s
  };
  const irParaAgendamento = (id) => {
    setPerfilAberto(false); setAba('agenda');
    if (id) { destacar([id]); setFoco({ id, n: Date.now() }); }
  };
  if (reconfigurando) return <PrimeiroAcesso modo="reconfigurar" tipo={loja.tipo} nomeLoja={loja.nome} adaptador={onboarding} aoConcluir={() => setReconfigurando(false)} aoCancelar={() => setReconfigurando(false)} />;
  const papel = sessao.papel === 'dono' ? 'Proprietário' : rotulo({ tipo: loja.tipo }, 'profissional', { capitalizado: true });
  // O menu mostra só o que a pessoa pode usar (o servidor confere de novo em cada rota). Serviços todo perfil pode ler; Equipe é do proprietário.
  const dono = sessao.papel === 'dono';
  // Um ícone para cada aba (e o mesmo do Artifact): Estabelecimento = loja, Estoque = caixa, Cupons = etiqueta, Boxes = carro, Comissões = carteira.
  const itens = [];
  if (dono || (sessao.secoes || []).includes('agenda')) itens.push(['agenda', 'Agenda', 'calendar']);
  if (dono || (sessao.secoes || []).includes('clientes')) itens.push(['clientes', 'Clientes', 'users']);
  itens.push(['servicos', 'Serviços', TIPOS[loja.tipo].visual.iconeServicos || 'scissors']);
  if (dono) itens.push(['equipe', 'Equipe', 'team']);
  if (dono && capAtiva('usaRecursoFisico')) itens.push(['boxes', 'Boxes', 'car']);
  if (dono || (sessao.secoes || []).includes('estabelecimento')) itens.push(['cupons', 'Cupons', 'tag']);
  if (dono || (sessao.secoes || []).includes('estoque')) itens.push(['estoque', 'Estoque', 'box']);
  if (dono || (sessao.secoes || []).includes('estabelecimento')) itens.push(['estabelecimento', 'Estabelecimento', 'store']);
  if (dono) itens.push(['relatorios', 'Relatórios', 'list']);
  if (dono) itens.push(['comissoes', 'Comissões', 'wallet']);
  else itens.push(['ganhos', 'Meus ganhos', 'gauge']);
  if (dono || (sessao.secoes || []).includes('agenda')) itens.push(['avisos', 'Avisos', 'bell']);
  itens.push(['suporte', 'Suporte', 'info']);
  return (
    <div className="app">
      <header className="topo">
        <LogoPequena loja={loja} />
        <nav className="nav" aria-label="Seções">
          {itens.map(([k, r, ic]) => (
            <button key={k} type="button" className={aba === k ? 'on' : ''} onClick={() => { setAba(k); setFoco(null); }} aria-current={aba === k ? 'page' : undefined} title={r} data-testid={`nav-${k}`}><Icone n={ic} size={17} /><span>{r}</span>{k === 'suporte' && chamadosNovos > 0 && <i className="badge" data-testid="badge-suporte">{chamadosNovos}</i>}</button>
          ))}
        </nav>
        <div className="topo-dir">
          <div className="usuario">
            <button type="button" className="usuario-perfil-real" onClick={() => setPerfilAberto(true)} aria-label="Meu perfil" title="Meu perfil" data-testid="abrir-perfil">
              <AvatarReal nome={meus?.apelido || meus?.nome || sessao.nome} foto={meus?.foto} chave={sessao.id} />
              <span className="usuario-txt"><b data-testid="topo-nome">{meus?.apelido || meus?.nome || sessao.nome}</b><small>{papel}</small></span>
            </button>
            <button type="button" className="icone-btn" onClick={aoSair} aria-label="Sair" title="Sair" data-testid="sair"><Icone n="logout" size={17} /></button>
          </div>
        </div>
      </header>
      {(sessao.secoes || []).includes('agenda') && <AlertaAgenda prefs={prefs} aoIr={irParaAgendamento} aoDestacar={destacar} />}
      {perfilAberto && <MeuPerfil loja={loja} sessao={sessao} dados={meus} prefs={prefs} aoPrefs={setPrefs} aoMudou={(d) => setMeus((antes) => ({ ...(antes || {}), ...d }))} aoFechar={() => setPerfilAberto(false)} />}
      <div className="corpo">
        <main className="principal">
          {aba === 'avisos' && (dono || (sessao.secoes || []).includes('agenda')) && (
            <section className="tela" data-testid="tela-avisos">
              <header className="tela-topo"><h1>Avisos</h1></header>
              <Avisos />
            </section>
          )}
          {aba === 'agenda' && <Agenda destaqueIds={Object.keys(destaques)} foco={foco} recarregar={recarregar} nomeLoja={loja.nome} meuId={sessao.id} ehProprio={sessao.papel === 'profissional'} ehDono={dono || sessao.papel === 'admin' || sessao.papel === 'atendente'} />}
          {aba === 'clientes' && <Clientes />}
          {aba === 'servicos' && <Servicos ehDono={dono || (sessao.secoes || []).includes('servicos')} />}
          {aba === 'equipe' && dono && <Equipe meuId={sessao.id} />}
          {aba === 'boxes' && dono && <Boxes />}
          {aba === 'cupons' && (dono || (sessao.secoes || []).includes('estabelecimento')) && <Cupons />}
          {aba === 'estoque' && (dono || (sessao.secoes || []).includes('estoque')) && <Estoque ehDono={dono} />}
          {aba === 'estabelecimento' && (dono || (sessao.secoes || []).includes('estabelecimento')) && <Estabelecimento ehDono={dono} aoReconfigurar={() => setReconfigurando(true)} />}
          {aba === 'relatorios' && dono && <Relatorios />}
          {aba === 'comissoes' && dono && <Comissoes />}
          {aba === 'ganhos' && !dono && <Ganhos />}
          {aba === 'suporte' && <Suporte adaptador={apiSuporte} ehDono={dono} aoMudar={lerChamadosNovos} />}
        </main>
      </div>
    </div>
  );
}

// Link do cliente: #agendar (qualquer profissional) ou #agendar-<id do profissional>. Só letras, números e hífen. Vale sem login.
const PUBLICA = /^#agendar(-[\w-]{1,40})?$/;
function useHash() {
  const [hash, setHash] = useState(() => (globalThis.location ? globalThis.location.hash : ''));
  useEffect(() => {
    const f = () => setHash(globalThis.location.hash);
    globalThis.addEventListener('hashchange', f);
    return () => globalThis.removeEventListener('hashchange', f);
  }, []);
  return hash;
}

// Estados do início: carregando → loja (ou erro). Loja inexistente (404) nunca cai numa loja padrão.
export default function AppReal() {
  const hash = useHash();
  const [estado, setEstado] = useState({ fase: 'carregando' });
  const [sessao, setSessao] = useState(() => sessaoAtual());
  const [senhaEnviada, setSenhaEnviada] = useState(''); // a senha temporária digitada no login, só em memória e só até a troca
  const carregar = async () => {
    setEstado({ fase: 'carregando' });
    const r = await carregarLoja();
    if (!r.ok) { setEstado({ fase: r.status === 404 ? 'sem-loja' : 'erro', erro: r.erro }); return; }
    if (!tipoValido(r.loja.tipo)) { setEstado({ fase: 'erro', erro: 'Esta loja usa um tipo que este site ainda não conhece. Tente de novo mais tarde.' }); return; }
    definirTipoAtivo({ tipo: r.loja.tipo });
    setEstado({ fase: 'ok', loja: r.loja });
  };
  useEffect(() => { carregar(); }, []);
  const loja = estado.fase === 'ok' ? estado.loja : null;
  useEffect(() => { if (loja) document.documentElement.setAttribute('data-tipo', loja.tipo); }, [loja]);
  const css = useMemo(() => (loja ? cssDaMarca({ logo: loja.logo, corTema: loja.temaCor, corTema2: loja.temaCor2, temaCor: loja.temaCor ? 'logo' : 'padrao' }) : ''), [loja]);
  const aoSair = () => { sair(); setSessao(null); setSenhaEnviada(''); };

  if (estado.fase === 'carregando') return <><AvisoRede /><main className="login"><div className="login-cartao" role="status" data-testid="carregando"><p className="muted">Carregando…</p></div></main></>;
  if (estado.fase === 'sem-loja') return <Cartao><h1>Loja não encontrada</h1><p className="muted" data-testid="loja-nao-encontrada">O endereço usado não aponta para nenhuma loja do Agendz. Confira o link com o estabelecimento.</p></Cartao>;
  if (estado.fase === 'erro') return <Cartao><h1>Não foi possível abrir</h1><Aviso tipo="erro" data-testid="erro-carga">{estado.erro}</Aviso><Btn variante="primario" onClick={carregar} data-testid="tentar-de-novo">Tentar de novo</Btn></Cartao>;
  const publica = PUBLICA.exec(hash);
  if (publica) {
    return (
      <>
        <AvisoRede />
        {css && <style id="tema-marca">{css}</style>}
        <AgendarPublico loja={loja} profissionalInicial={publica[1] ? publica[1].slice(1) : ''} logado={!!sessao} aoVoltar={() => { globalThis.location.hash = ''; }} />
      </>
    );
  }
  return (
    <>
      <AvisoRede />
      {css && <style id="tema-marca">{css}</style>}
      {!sessao && <Login loja={loja} aoEntrar={(se, senha) => { setSenhaEnviada(senha || ''); setSessao(se); }} />}
      {sessao && sessao.deveTrocarSenha && <TrocarSenha loja={loja} sessao={sessao} senhaEnviada={senhaEnviada} aoTrocar={(se) => { setSenhaEnviada(''); setSessao(se); }} aoSair={aoSair} />}
      {sessao && !sessao.deveTrocarSenha && sessao.papel === 'dono' && sessao.onboardingPendente && <PrimeiroAcesso tipo={loja.tipo} nomeLoja={loja.nome} adaptador={onboarding} aoConcluir={() => setSessao({ ...sessao, onboardingPendente: false })} />}
      {sessao && !sessao.deveTrocarSenha && !(sessao.papel === 'dono' && sessao.onboardingPendente) && <Painel loja={loja} sessao={sessao} aoSair={aoSair} />}
    </>
  );
}
