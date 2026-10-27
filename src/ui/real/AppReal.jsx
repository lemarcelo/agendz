/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Casca do site publicado (API real), F2 parte 1: carrega a loja do endereço (GET /api/publico/loja), faz o login real, troca a senha
// temporária e mostra o painel inicial. Os módulos (agenda, clientes, serviços…) entram nas partes seguintes do F2, cada um só quando o
// servidor tem a regra inteira. Não importa `api.js` (a simulada) nem `hooks.js`: o estado aqui é só o da sessão real, em memória.
import React, { useEffect, useMemo, useState } from 'react';
import { carregarLoja, entrar, loginValido, onboarding, sair, sessaoAtual, trocarSenha } from '../../services/api-real.js';
import PrimeiroAcesso from '../leve/PrimeiroAcesso.jsx';
import { TIPOS, definirTipoAtivo, rotulo, tipoValido } from '../../domain/tipos.js';
import { cssDaMarca, logoValida } from '../../domain/tema.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

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

function Painel({ loja, sessao, aoSair }) {
  const [reconfigurando, setReconfigurando] = useState(false);
  if (reconfigurando) return <PrimeiroAcesso modo="reconfigurar" tipo={loja.tipo} nomeLoja={loja.nome} adaptador={onboarding} aoConcluir={() => setReconfigurando(false)} aoCancelar={() => setReconfigurando(false)} />;
  const papel = sessao.papel === 'dono' ? 'Proprietário' : rotulo({ tipo: loja.tipo }, 'profissional', { capitalizado: true });
  return (
    <Cartao loja={loja}>
      <div className="form-grade um" data-testid="painel-real">
        <p><b data-testid="painel-nome">{sessao.nome}</b> · <span data-testid="painel-papel">{papel}</span></p>
        <Aviso>Sua conta está pronta e o acesso é seguro. A agenda, os clientes e os serviços chegam ao site nas próximas atualizações.</Aviso>
        {sessao.papel === 'dono' && <Btn onClick={() => setReconfigurando(true)} data-testid="reconfigurar-abrir">Reconfigurar estabelecimento</Btn>}
        <Btn onClick={aoSair} data-testid="sair">Sair</Btn>
      </div>
    </Cartao>
  );
}

// Estados do início: carregando → loja (ou erro). Loja inexistente (404) nunca cai numa loja padrão.
export default function AppReal() {
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

  if (estado.fase === 'carregando') return <main className="login"><div className="login-cartao" role="status" data-testid="carregando"><p className="muted">Carregando…</p></div></main>;
  if (estado.fase === 'sem-loja') return <Cartao><h1>Loja não encontrada</h1><p className="muted" data-testid="loja-nao-encontrada">O endereço usado não aponta para nenhuma loja do Agendz. Confira o link com o estabelecimento.</p></Cartao>;
  if (estado.fase === 'erro') return <Cartao><h1>Não foi possível abrir</h1><Aviso tipo="erro" data-testid="erro-carga">{estado.erro}</Aviso><Btn variante="primario" onClick={carregar} data-testid="tentar-de-novo">Tentar de novo</Btn></Cartao>;
  return (
    <>
      {css && <style id="tema-marca">{css}</style>}
      {!sessao && <Login loja={loja} aoEntrar={setSessao} />}
      {sessao && sessao.deveTrocarSenha && <TrocarSenha loja={loja} sessao={sessao} aoTrocar={setSessao} aoSair={aoSair} />}
      {sessao && !sessao.deveTrocarSenha && sessao.papel === 'dono' && sessao.onboardingPendente && <PrimeiroAcesso tipo={loja.tipo} nomeLoja={loja.nome} adaptador={onboarding} aoConcluir={() => setSessao({ ...sessao, onboardingPendente: false })} />}
      {sessao && !sessao.deveTrocarSenha && !(sessao.papel === 'dono' && sessao.onboardingPendente) && <Painel loja={loja} sessao={sessao} aoSair={aoSair} />}
    </>
  );
}
