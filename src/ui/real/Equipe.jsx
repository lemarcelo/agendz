/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Equipe do site real (F2 parte 4), só para o proprietário: lista, cadastro, edição, permissões por seção, parar/voltar a atender, refazer senha e remover.
// Toda regra (campos, CPF/apelido/e-mail únicos, último dono, histórico, agendamentos futuros) está no servidor; esta tela mostra o que ele devolve.
// A senha temporária é gerada no servidor e aparece UMA vez, aqui, até a pessoa tocar em "Anotei"; nunca vai para storage nem para a URL.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). A foto do cadastro chega numa próxima atualização.
import React, { useEffect, useState } from 'react';
import { equipe as api } from '../../services/api-real.js';
import { Rot } from '../../domain/tipos.js';
import { SECOES, SECOES_LIBERAVEIS, formatarCpf, formatarTelefone, somenteDigitos } from '../../domain/rules.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const telNacional = (t) => { const d = somenteDigitos(t); return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d; };
const num = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const txt = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const rotuloPapel = (p) => (p === 'dono' ? 'Proprietário' : p === 'admin' ? 'Administrador' : p === 'atendente' ? 'Atendente' : Rot('profissional'));
const ESCOLHA = { padrao: '', liberar: 'sim', bloquear: 'nao' };

function PainelSenha({ pessoa, senha, aoFechar }) {
  return (
    <section className="aviso aviso-info" role="alert" data-testid="equipe-senha">
      <div>
        <p><b>Senha temporária de {pessoa.apelido || pessoa.nome}.</b> Ela aparece só desta vez: anote e entregue à pessoa. No primeiro acesso ela confirma esta senha e escolhe o próprio usuário e a senha definitiva.</p>
        <p>Usuário atual: <b data-testid="equipe-senha-usuario">{pessoa.usuario}</b></p>
        <p>Senha temporária: <code data-testid="equipe-senha-valor">{senha}</code></p>
        <Btn variante="primario" onClick={aoFechar} data-testid="equipe-senha-anotei">Anotei</Btn>
      </div>
    </section>
  );
}

function FormPessoa({ ficha, aoSalvar, aoCancelar }) {
  const novo = !ficha.id;
  const [f, setF] = useState(() => ({
    nome: ficha.nome || '', apelido: ficha.apelido || '', usuario: '', cpf: ficha.cpf ? formatarCpf(ficha.cpf) : '', nascimento: ficha.nascimento || '',
    email: ficha.email || '', telefone: ficha.telefone ? formatarTelefone(telNacional(ficha.telefone)) : '', papel: ficha.papel || 'profissional',
    atende: novo ? true : !!ficha.atende, podeVender: ficha.podeVender !== false, comissao: txt(ficha.comissaoPct),
    permissoes: Object.fromEntries(SECOES_LIBERAVEIS.map((k) => [k, typeof (ficha.permissoes || {})[k] === 'boolean' ? (ficha.permissoes[k] ? ESCOLHA.liberar : ESCOLHA.bloquear) : ESCOLHA.padrao])),
  }));
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mudar = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    const corpo = { nome: f.nome, apelido: f.apelido, cpf: f.cpf, nascimento: f.nascimento, email: f.email, telefone: f.telefone, papel: f.papel, atende: f.atende, podeVender: f.podeVender };
    if (novo && f.usuario.trim()) corpo.usuario = f.usuario.trim().toLowerCase();
    const c = num(f.comissao); if (c !== null) corpo.comissaoPct = c;
    if (f.papel !== 'dono') corpo.permissoes = Object.fromEntries(SECOES_LIBERAVEIS.filter((k) => f.permissoes[k] !== ESCOLHA.padrao).map((k) => [k, f.permissoes[k] === ESCOLHA.liberar]));
    if (!novo) corpo.id = ficha.id;
    const r = await api.salvar(corpo);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r);
  };
  return (
    <section className="tela" data-testid="eq-form">
      <header className="tela-topo"><h1>{novo ? 'Nova pessoa da equipe' : 'Editar pessoa'}</h1></header>
      <form onSubmit={salvar} className="form-grade">
        <Campo rotulo="Nome completo"><input value={f.nome} maxLength={150} onChange={mudar('nome')} data-testid="eq-nome" /></Campo>
        <Campo rotulo="Apelido (como aparece na agenda)"><input value={f.apelido} maxLength={60} onChange={mudar('apelido')} data-testid="eq-apelido" /></Campo>
        {novo && <Campo rotulo="Usuário para entrar (opcional; vazio = gerado pelo apelido)"><input value={f.usuario} maxLength={60} autoComplete="off" autoCapitalize="none" onChange={mudar('usuario')} data-testid="eq-usuario" /></Campo>}
        <Campo rotulo="Perfil">
          <select value={f.papel} onChange={mudar('papel')} data-testid="eq-papel">
            {['profissional', 'atendente', 'admin', 'dono'].map((p) => <option key={p} value={p}>{rotuloPapel(p)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="CPF (opcional)"><input value={f.cpf} inputMode="numeric" maxLength={14} onChange={(e) => setF({ ...f, cpf: formatarCpf(e.target.value) })} data-testid="eq-cpf" /></Campo>
        <Campo rotulo="Nascimento (opcional)"><input type="date" value={f.nascimento} onChange={mudar('nascimento')} data-testid="eq-nasc" /></Campo>
        <Campo rotulo="E-mail (opcional)"><input type="email" value={f.email} maxLength={150} autoComplete="off" onChange={mudar('email')} data-testid="eq-email" /></Campo>
        <Campo rotulo="Telefone (opcional)"><input value={f.telefone} inputMode="tel" maxLength={20} onChange={(e) => setF({ ...f, telefone: formatarTelefone(e.target.value) })} data-testid="eq-tel" /></Campo>
        <Campo rotulo="Comissão da pessoa (%, opcional)"><input value={f.comissao} inputMode="decimal" onChange={mudar('comissao')} data-testid="eq-comissao" /></Campo>
        <label className="pa-check"><input type="checkbox" checked={f.atende} onChange={(e) => setF({ ...f, atende: e.target.checked })} data-testid="eq-atende" /> Atende clientes (aparece na agenda)</label>
        <label className="pa-check"><input type="checkbox" checked={f.podeVender} onChange={(e) => setF({ ...f, podeVender: e.target.checked })} data-testid="eq-vender" /> Pode vender produtos</label>
        {f.papel !== 'dono' && (
          <fieldset className="conj" data-testid="eq-permissoes">
            <legend>O que a pessoa acessa</legend>
            <p className="muted">“Padrão” segue o perfil. Você pode liberar ou bloquear cada seção.</p>
            {SECOES_LIBERAVEIS.map((k) => (
              <Campo key={k} rotulo={SECOES[k]}>
                <select value={f.permissoes[k]} onChange={(e) => setF({ ...f, permissoes: { ...f.permissoes, [k]: e.target.value } })} data-testid={`eq-perm-${k}`}>
                  <option value={ESCOLHA.padrao}>Padrão do perfil</option><option value={ESCOLHA.liberar}>Liberado</option><option value={ESCOLHA.bloquear}>Bloqueado</option>
                </select>
              </Campo>
            ))}
          </fieldset>
        )}
        {novo && <Aviso>A senha é gerada pelo sistema e aparece uma única vez depois de salvar.</Aviso>}
        {erro && <Aviso tipo="erro" data-testid="eq-erro">{erro}</Aviso>}
        <div className="acoes">
          <Btn onClick={aoCancelar} data-testid="eq-cancelar">Cancelar</Btn>
          <Btn variante="primario" type="submit" disabled={enviando} data-testid="salvar-pessoa">{enviando ? 'Salvando…' : 'Salvar'}</Btn>
        </div>
      </form>
    </section>
  );
}

export default function Equipe({ meuId }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ficha, setFicha] = useState(null);
  const [senha, setSenha] = useState(null); // { pessoa, valor }
  const [removendo, setRemovendo] = useState(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await api.listar();
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setLista([]); return; }
      setErro(''); setLista(r.usuarios);
    })();
    return () => { vivo = false; };
  }, [versao]);

  const recarregar = () => setVersao((v) => v + 1);
  const abrir = async (p) => {
    setErro('');
    const r = await api.obter(p.id);
    if (!r.ok) { setErro(r.erro); return; }
    setFicha(r.usuario);
  };
  const atender = async (p) => {
    setErro(''); setAviso('');
    const r = await api.definirAtendimento(p.id, !p.atende);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso(r.usuario.atende ? `${p.apelido || p.nome} voltou a atender.` : `${p.apelido || p.nome} parou de atender (o histórico continua).`);
    recarregar();
  };
  const refazer = async (p) => {
    setErro(''); setAviso('');
    const r = await api.refazerSenha(p.id);
    if (!r.ok) { setErro(r.erro); return; }
    setSenha({ pessoa: r.usuario, valor: r.senhaTemporaria });
    recarregar();
  };
  const remover = async (p) => {
    setRemovendo(null); setErro(''); setAviso('');
    const r = await api.remover(p.id);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso('Pessoa removida.');
    recarregar();
  };

  if (ficha) {
    return <FormPessoa ficha={ficha} aoCancelar={() => setFicha(null)} aoSalvar={(r) => { setFicha(null); if (r.senhaTemporaria) setSenha({ pessoa: r.usuario, valor: r.senhaTemporaria }); else setAviso('Pessoa salva.'); recarregar(); }} />;
  }
  return (
    <section className="tela" data-testid="tela-equipe">
      <header className="tela-topo">
        <h1>Equipe</h1>
        <Btn variante="primario" onClick={() => { setAviso(''); setFicha({}); }} data-testid="nova-pessoa"><Icone n="plus" size={16} /> Nova pessoa</Btn>
      </header>
      {senha && <PainelSenha pessoa={senha.pessoa} senha={senha.valor} aoFechar={() => setSenha(null)} />}
      {aviso && <Aviso data-testid="eq-salvo"><span role="status">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro" data-testid="eq-erro-lista">{erro}</Aviso>}
      {lista === null ? <p className="muted" role="status" data-testid="eq-carregando">Carregando…</p>
        : lista.length === 0 ? <p className="muted" data-testid="eq-vazio">Nenhuma pessoa cadastrada.</p> : (
          <ul className="clientes-lista" data-testid="eq-lista">
            {lista.map((p) => (
              <li key={p.id} className="cliente-cartao" data-testid={`eq-${p.id}`}>
                <div className="cliente-dados">
                  <b data-testid="eq-item-nome">{p.apelido || p.nome}</b>{p.apelido && p.apelido !== p.nome ? <small className="muted"> {p.nome}</small> : null}
                  <span className="cliente-linha">{rotuloPapel(p.papel)} · {p.atende ? 'atende' : 'não atende'} · usuário {p.usuario}</span>
                  {p.deveTrocarSenha && <span className="cliente-linha muted">Ainda não fez o primeiro acesso</span>}
                  {p.cpfMascarado ? <span className="cliente-linha muted">CPF {p.cpfMascarado}</span> : null}
                  {removendo === p.id && (
                    <div className="acoes" data-testid={`eq-confirmar-${p.id}`}>
                      <span>Remover {p.apelido || p.nome}?</span>
                      <Btn tamanho="sm" variante="perigo" onClick={() => remover(p)} data-testid={`eq-remover-sim-${p.id}`}>Remover</Btn>
                      <Btn tamanho="sm" onClick={() => setRemovendo(null)} data-testid={`eq-remover-nao-${p.id}`}>Manter</Btn>
                    </div>
                  )}
                </div>
                <div className="acoes">
                  <Btn tamanho="sm" onClick={() => abrir(p)} aria-label={`Editar ${p.apelido || p.nome}`} data-testid={`editar-${p.id}`}><Icone n="edit" size={15} /> Editar</Btn>
                  <Btn tamanho="sm" onClick={() => atender(p)} data-testid={`atender-${p.id}`}>{p.atende ? 'Parar de atender' : 'Voltar a atender'}</Btn>
                  {p.id !== meuId && <Btn tamanho="sm" onClick={() => refazer(p)} data-testid={`senha-${p.id}`}>Refazer senha</Btn>}
                  {p.id !== meuId && <Btn tamanho="sm" onClick={() => setRemovendo(p.id)} aria-label={`Remover ${p.apelido || p.nome}`} data-testid={`remover-${p.id}`}><Icone n="trash" size={15} /></Btn>}
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
