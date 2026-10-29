/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Casca do site publicado (API real), F2: carrega a loja do endereço (GET /api/publico/loja), faz o login real, troca a senha
// temporária e mostra o painel com o menu. Os módulos entram um a um (Clientes na parte 2, Serviços na 3, Equipe na 4; a agenda na seguinte), cada um só
// quando o servidor tem a regra inteira. Não importa `api.js` (a simulada) nem `hooks.js`: o estado aqui é só o da sessão real, em memória.
import React, { useEffect, useMemo, useState } from 'react';
import { cancelarEspera, carregarLoja, entrar, esperandoRede, loginValido, onboarding, quandoEsperar, sair, sessaoAtual, trocarSenha } from '../../services/api-real.js';
import PrimeiroAcesso from '../leve/PrimeiroAcesso.jsx';
import Agenda from './Agenda.jsx';
import Clientes from './Clientes.jsx';
import Servicos from './Servicos.jsx';
import Equipe from './Equipe.jsx';
import Comissoes from './Comissoes.jsx';
import Ganhos from './Ganhos.jsx';
import RegrasAtendimento from './RegrasAtendimento.jsx';
import Cupons from './Cupons.jsx';
import AgendarPublico from './AgendarPublico.jsx';
import LinkAgendamento from './LinkAgendamento.jsx';
import Avisos from './Avisos.jsx';
import { TIPOS, definirTipoAtivo, rotulo, tipoValido } from '../../domain/tipos.js';
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
    aoEntrar(r.sessao);
  };
  return (
    <Cartao loja={loja}>
      <form onSubmit={enviar} className="form-grade um">
        <Campo rotulo="Usuário"><input value={id} onChange={(e) => { setId(e.target.value); setErro(''); }} autoComplete="username" autoFocus maxLength={60} data-testid="login-id" /></Campo>
        <Campo rotulo="Senha"><input type="password" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(''); }} autoComplete="current-password" maxLength={100} data-testid="login-senha" /></Campo>
        {erro && <Aviso tipo="erro" data-testid="login-erro">{erro}</Aviso>}
        <Btn variante="primario" type="submit" disabled={enviando} data-testid="login-entrar">{enviando ? 'Entrando…' : 'Entrar'}</Btn>
        <button type="button" className="link" onClick={() => setEsqueci(!esqueci)} aria-expanded={esqueci} data-testid="login-esqueci">Esqueci minha senha</button>
        {esqueci && <Aviso data-testid="login-esqueci-texto">Ainda não há e-mail nem WhatsApp configurado para recuperar a senha. Peça ao suporte do Agendz para redefinir: você recebe uma senha temporária e escolhe a sua no primeiro acesso.</Aviso>}
      </form>
    </Cartao>
  );
}

function TrocarSenha({ loja, sessao, aoTrocar, aoSair }) {
  const [f, setF] = useState({ atual: '', usuario: '', nova: '', repetir: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mudar = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErro(''); };
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    const usuario = f.usuario.trim().toLowerCase();
    if (!loginValido(usuario)) { setErro('Escolha o seu usuário: de 2 a 60 caracteres, só letras, números, ponto, hífen e sublinhado'); return; }
    if (f.nova !== f.repetir) { setErro('A confirmação da nova senha não confere'); return; }
    setEnviando(true); setErro('');
    const r = await trocarSenha({ senhaAtual: f.atual, nova: f.nova, usuario });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoTrocar(r.sessao);
  };
  return (
    <Cartao loja={loja}>
      <form onSubmit={enviar} className="form-grade um">
        <p><b>Olá, {sessao.nome}.</b> Sua senha é temporária. Confirme-a e escolha o seu usuário e a sua senha para continuar.</p>
        <Campo rotulo="Senha temporária (a que você recebeu)"><input type="password" value={f.atual} onChange={mudar('atual')} autoComplete="current-password" autoFocus maxLength={100} data-testid="troca-atual" /></Campo>
        <Campo rotulo="Seu usuário (você escolhe; letras, números, ponto, hífen)"><input value={f.usuario} onChange={mudar('usuario')} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={60} data-testid="troca-usuario" /></Campo>
        <Campo rotulo="Sua senha definitiva (8 caracteres ou mais)"><input type="password" value={f.nova} onChange={mudar('nova')} autoComplete="new-password" maxLength={100} data-testid="troca-nova" /></Campo>
        <Campo rotulo="Repita a senha definitiva"><input type="password" value={f.repetir} onChange={mudar('repetir')} autoComplete="new-password" maxLength={100} data-testid="troca-repetir" /></Campo>
        {erro && <Aviso tipo="erro" data-testid="troca-erro">{erro}</Aviso>}
        <p className="muted" data-testid="troca-esqueci">Esqueceu a senha depois? Quando o e-mail ou o WhatsApp da loja estiver configurado, dá para redefinir por lá. Até lá, peça ao suporte do Agendz, que redefine para você.</p>
        <Btn variante="primario" type="submit" disabled={enviando} data-testid="troca-salvar">{enviando ? 'Salvando…' : 'Salvar usuário e senha'}</Btn>
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
  const [aba, setAba] = useState('inicio');
  const [reconfigurando, setReconfigurando] = useState(false);
  if (reconfigurando) return <PrimeiroAcesso modo="reconfigurar" tipo={loja.tipo} nomeLoja={loja.nome} adaptador={onboarding} aoConcluir={() => setReconfigurando(false)} aoCancelar={() => setReconfigurando(false)} />;
  const papel = sessao.papel === 'dono' ? 'Proprietário' : rotulo({ tipo: loja.tipo }, 'profissional', { capitalizado: true });
  // O menu mostra só o que a pessoa pode usar (o servidor confere de novo em cada rota). Serviços todo perfil pode ler; Equipe é do proprietário.
  const dono = sessao.papel === 'dono';
  const itens = [['inicio', 'Início', 'store']];
  if (dono || (sessao.secoes || []).includes('agenda')) itens.push(['agenda', 'Agenda', 'calendar']);
  if (dono || (sessao.secoes || []).includes('clientes')) itens.push(['clientes', 'Clientes', 'users']);
  itens.push(['servicos', 'Serviços', 'scissors']);
  if (dono) itens.push(['equipe', 'Equipe', 'team']);
  if (dono || (sessao.secoes || []).includes('estabelecimento')) itens.push(['cupons', 'Cupons', 'key']);
  if (dono) itens.push(['comissoes', 'Comissões', 'wallet']);
  else itens.push(['ganhos', 'Meus ganhos', 'wallet']);
  return (
    <div className="app">
      <header className="topo">
        <LogoPequena loja={loja} />
        <nav className="nav" aria-label="Seções">
          {itens.map(([k, r, ic]) => (
            <button key={k} type="button" className={aba === k ? 'on' : ''} onClick={() => setAba(k)} aria-current={aba === k ? 'page' : undefined} title={r} data-testid={`nav-${k}`}><Icone n={ic} size={17} /><span>{r}</span></button>
          ))}
        </nav>
        <div className="topo-dir">
          <div className="usuario">
            <button type="button" className="icone-btn" onClick={aoSair} aria-label="Sair" title="Sair" data-testid="sair"><Icone n="logout" size={17} /></button>
          </div>
        </div>
      </header>
      <div className="corpo">
        <main className="principal">
          {aba === 'inicio' && (
            <section className="tela" data-testid="painel-real">
              <p><b data-testid="painel-nome">{sessao.nome}</b> · <span data-testid="painel-papel">{papel}</span></p>
              <Aviso>Sua conta está pronta e o acesso é seguro. Clientes, serviços, equipe, a agenda (horários, calendário, status, remarcar e o botão Atender) e as comissões já estão aqui.</Aviso>
              <Avisos />
              {sessao.papel === 'dono' && <Btn onClick={() => setReconfigurando(true)} data-testid="reconfigurar-abrir">Reconfigurar estabelecimento</Btn>}
              {sessao.papel === 'dono' && <RegrasAtendimento />}
              {sessao.papel === 'dono' && <LinkAgendamento />}
            </section>
          )}
          {aba === 'agenda' && <Agenda meuId={sessao.id} ehProprio={sessao.papel === 'profissional'} ehDono={dono || sessao.papel === 'admin' || sessao.papel === 'atendente'} />}
          {aba === 'clientes' && <Clientes />}
          {aba === 'servicos' && <Servicos ehDono={dono || (sessao.secoes || []).includes('servicos')} />}
          {aba === 'equipe' && dono && <Equipe meuId={sessao.id} />}
          {aba === 'cupons' && (dono || (sessao.secoes || []).includes('estabelecimento')) && <Cupons />}
          {aba === 'comissoes' && dono && <Comissoes />}
          {aba === 'ganhos' && !dono && <Ganhos />}
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
  const aoSair = () => { sair(); setSessao(null); };

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
      {!sessao && <Login loja={loja} aoEntrar={setSessao} />}
      {sessao && sessao.deveTrocarSenha && <TrocarSenha loja={loja} sessao={sessao} aoTrocar={setSessao} aoSair={aoSair} />}
      {sessao && !sessao.deveTrocarSenha && sessao.papel === 'dono' && sessao.onboardingPendente && <PrimeiroAcesso tipo={loja.tipo} nomeLoja={loja.nome} adaptador={onboarding} aoConcluir={() => setSessao({ ...sessao, onboardingPendente: false })} />}
      {sessao && !sessao.deveTrocarSenha && !(sessao.papel === 'dono' && sessao.onboardingPendente) && <Painel loja={loja} sessao={sessao} aoSair={aoSair} />}
    </>
  );
}
