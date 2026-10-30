/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Logo e cor do tema da loja no site real (Estabelecimento). A logo é reduzida aqui (PNG/WebP/JPEG de até ~100 KB, nunca o arquivo original) e o servidor
// confere o tipo pelo CONTEÚDO. O tema é o par de cores (#rrggbb): Padrão (sem cores), paletas prontas ou as cores da logo. Sem logo, a marca é o ícone do TIPO
// (nunca a logo de outra loja). Depois de salvar, `aoMudar(marca)` faz o topo e os botões trocarem na hora. Só o proprietário altera.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useState } from 'react';
import { marca as api } from '../../services/api-real.js';
import { PALETAS, corTemaDaPaleta, logoValida, opcaoDoTema } from '../../domain/tema.js';
import { iconeMarcaAtivo } from '../../domain/tipos.js';
import { prepararLogo } from '../logo-arquivo.js';
import { Aviso, Btn, Icone } from '../leve/mini.jsx';

export default function MarcaLoja({ aoMudar }) {
  const [m, setM] = useState(null); // { logo, temaCor, temaCor2 }; null = carregando
  const [coresDaLogo, setCoresDaLogo] = useState(null); // as duas cores achadas na logo ENVIADA nesta tela (a gravada guarda só o par em uso)
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    api.obter().then((r) => { if (!vivo) return; if (r.ok) setM(r.marca); else { setErro(r.erro); setM({ erro: true }); } });
    return () => { vivo = false; };
  }, []);
  if (m === null) return <p className="muted" role="status" data-testid="marca-carregando">Carregando…</p>;
  if (m.erro) return <Aviso tipo="erro" data-testid="marca-erro">{erro}</Aviso>;

  const gravar = async (novo, aviso) => {
    setErro(''); setOk(''); setOcupado(true);
    const r = await api.gravar(novo);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return false; }
    setM(r.marca); setOk(aviso);
    if (aoMudar) aoMudar(r.marca);
    return true;
  };
  const enviar = async (ev) => {
    const arq = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    setErro(''); setOk(''); setOcupado(true);
    let pronta;
    try { pronta = await prepararLogo(arq); } catch (e) { setOcupado(false); setErro(e.message); return; }
    setOcupado(false);
    setCoresDaLogo(pronta.cores);
    // a logo nova troca a anterior; o tema em uso fica como está (as cores da logo são uma escolha abaixo)
    await gravar({ logo: pronta.logo, temaCor: m.temaCor, temaCor2: m.temaCor2 }, pronta.cores ? 'Logo salva. Em "Cor do tema" dá para usar as cores dela.' : 'Logo salva. Ela não tem uma cor marcante, então "Cores da logo" fica indisponível.');
  };
  const remover = () => gravar({ logo: null, temaCor: m.temaCor, temaCor2: m.temaCor2 }, 'Logo removida.').then(() => setCoresDaLogo(null));
  const escolher = (id) => {
    if (id === 'padrao') return gravar({ logo: m.logo, temaCor: null, temaCor2: null }, 'Tema padrão.');
    if (id === 'logo') return coresDaLogo ? gravar({ logo: m.logo, temaCor: coresDaLogo[0], temaCor2: coresDaLogo[1] }, 'Tema com as cores da logo.') : undefined;
    const c = corTemaDaPaleta(id);
    return c ? gravar({ logo: m.logo, ...c }, 'Cor do tema salva.') : undefined;
  };

  const tem = logoValida(m.logo);
  const atual = opcaoDoTema(m.temaCor, m.temaCor2);
  const opcoes = [
    { id: 'padrao', nome: 'Padrão', amostra: null },
    { id: 'logo', nome: 'Cores da logo', amostra: coresDaLogo || (atual === 'logo' ? [m.temaCor, m.temaCor2 || m.temaCor] : null) },
    ...PALETAS.map((x) => ({ id: x.id, nome: x.nome, amostra: x.cores })),
  ];
  return (
    <div className="marca-painel" data-testid="marca-painel">
      <p className="muted">A logo aparece no topo, na tela de entrada e na página de agendamento do cliente. Sem logo, aparece o ícone do tipo da loja. A cor do tema (degradê no topo e nos botões principais) se escolhe abaixo.</p>
      <div className="marca-previa">
        {tem ? <img src={m.logo} alt="Logo atual" data-testid="marca-logo-previa" /> : <span className="marca-vazia" data-testid="marca-sem-logo"><Icone n={iconeMarcaAtivo()} size={34} /></span>}
        <div className="marca-acoes">
          <label className={`btn btn-primario${ocupado ? ' btn-desativado' : ''}`} data-testid="marca-enviar" aria-disabled={ocupado}>
            <Icone n="plus" size={17} />{ocupado ? 'Preparando…' : tem ? 'Trocar a logo' : 'Enviar a logo'}
            <input type="file" accept="image/*" onChange={enviar} disabled={ocupado} className="entrada-oculta" data-testid="marca-arquivo" />
          </label>
          {tem && <Btn onClick={remover} disabled={ocupado} data-testid="marca-remover">Remover</Btn>}
          <small className="muted">PNG, JPEG ou WebP; pode ser foto do celular, o site reduz sozinho (até cerca de 100 KB). Fundo transparente fica melhor.</small>
        </div>
      </div>
      <div className="marca-cores" data-testid="marca-cores">
        <h3>Cor do tema</h3>
        <div className="tema-opcoes" role="group" aria-label="Cor do tema">
          {opcoes.map((o) => {
            const indisponivel = o.id === 'logo' && !coresDaLogo && atual !== 'logo';
            return (
              <button key={o.id} type="button" className="tema-opcao" aria-pressed={atual === o.id} disabled={indisponivel || ocupado} onClick={() => escolher(o.id)} data-testid={`marca-tema-${o.id}`}>
                <span className="tema-amostra" style={o.amostra ? { background: `linear-gradient(100deg, ${o.amostra[0]}, ${o.amostra[1]})` } : undefined} />
                <b>{o.nome}</b>
                {indisponivel && <small>{tem ? 'Envie a logo de novo para ler as cores dela.' : 'Envie uma logo para usar.'}</small>}
                {o.id === 'padrao' && <small>Cores atuais</small>}
              </button>
            );
          })}
        </div>
      </div>
      {erro && <Aviso tipo="erro" data-testid="marca-erro">{erro}</Aviso>}
      {ok && <Aviso data-testid="marca-ok"><span role="status">{ok}</span></Aviso>}
    </div>
  );
}
