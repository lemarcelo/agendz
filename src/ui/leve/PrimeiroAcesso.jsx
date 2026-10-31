/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Assistente de primeiro acesso do dono (docs/F3-primeiro-acesso.md): Serviços → Produtos → Equipe (com a comissão de cada pessoa) → Expediente → Link do cliente (B9a) → Pronto. Cada passo é opcional (Pular).
// Fala com um `adaptador` (async, { ok, erro, ... }): no site real é o de api-real.js (/api/onboarding); no Artifact, a pré-visualização
// de services/onboarding-demo.js (nada é gravado). Não importa a API simulada: textos do tipo vêm de `rotulo`.
import React, { useEffect, useMemo, useState } from 'react';
import { cap, rotulo } from '../../domain/tipos.js';
import { produtosDoTipo } from '../../domain/catalogo.js';
import { Aviso, Btn, Campo, Icone } from './mini.jsx';

const dinheiro = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const lerNumero = (t) => { const n = Number(String(t).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const faixa = (mapa) => { const v = Object.values(mapa || {}); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
const ETAPAS = [['servicos', 'Serviços'], ['produtos', 'Produtos'], ['equipe', 'Equipe'], ['expediente', 'Expediente'], ['pronto', 'Pronto']];
const ETAPAS_BOX = [['servicos', 'Serviços'], ['produtos', 'Produtos'], ['equipe', 'Equipe'], ['boxes', 'Boxes'], ['expediente', 'Expediente'], ['pronto', 'Pronto']]; // tipo com box (estética): sem box a agenda não aceita carro
const ETAPA_LINK = ['link', 'Link do cliente']; // B9a: o que o cliente precisa informar ao pedir horário pelo link; só aparece se o adaptador tem `link`
const pctTxt = (n) => String(n).replace('.', ',');
// Comissão de cada pessoa (pedido do Marcelo, v102): sobre serviços (modo 'geral' = usa a geral da loja, 'propria' = percentual da pessoa) e sobre produtos
// (modoProd 'sem' = nenhuma, a menos que o próprio produto tenha a sua; 'propria' = percentual da pessoa).
const linhaNova = () => ({ nome: '', atende: true, modo: 'geral', pct: '', modoProd: 'sem', pctProd: '' });
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
// 'senha' já foi resolvido antes de chegar aqui; o servidor só guarda 'equipe' depois dos serviços, então retoma nos Produtos (opcionais, nada se repete: nome que existe é pulado).
const etapaDoPasso = (passo) => (passo === 'equipe' ? 'produtos' : passo === 'expediente' || passo === 'pronto' ? passo : 'servicos');

// modo 'primeiro': primeiro acesso do dono (termina com "Ir para o painel"). modo 'reconfigurar': aberto depois, em Estabelecimento > Reconfigurar;
// só ADICIONA (serviços novos, pessoas novas; nada é excluído) e o expediente enviado substitui o atual. `aoCancelar` mostra o botão Voltar.
export default function PrimeiroAcesso({ tipo, nomeLoja, adaptador, aoConcluir, aoCancelar, modo = 'primeiro', previa = false }) {
  const reconf = modo === 'reconfigurar';
  const [fase, setFase] = useState('carregando');
  const [erroCarga, setErroCarga] = useState('');
  const [estado, setEstado] = useState(null);
  const [etapa, setEtapa] = useState('servicos');
  const [marcas, setMarcas] = useState({}); // chave → { on, preco, duracao } (textos dos campos)
  const [proprios, setProprios] = useState([]); // serviços que o dono descreve na hora: { nome, categoria, preco, duracao } (textos)
  const [novo, setNovo] = useState({ nome: '', categoria: '', preco: '', duracao: '' });
  const [linhas, setLinhas] = useState([linhaNova()]);
  const [prods, setProds] = useState({}); // chave → { on, preco, estoque } (textos dos campos) dos produtos sugeridos
  const [propriosProd, setPropriosProd] = useState([]); // produtos que o dono descreve: { nome, preco, estoque } (números ou null)
  const [novoProd, setNovoProd] = useState({ nome: '', preco: '', estoque: '' });
  const [comGeral, setComGeral] = useState(50); // comissão geral vigente da loja (para mostrar "usar a geral (X%)"); o assistente não a altera
  const [criadas, setCriadas] = useState(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [exp, setExp] = useState(() => camposDoExpediente(null));
  const [linkCfg, setLinkCfg] = useState({ nome: true, telefone: true, placa: true, modelo: true, porte: true }); // B9a: padrão de fábrica do link = exige tudo
  const [boxLinhas, setBoxLinhas] = useState(['Box 1']); // nomes dos boxes (textos); os que já existem vêm do servidor e não são recriados
  // Reconfigurar com senha e desfazer: depois de concluído, a primeira tela pede a senha do dono; o histórico mostra o que cada reconfiguração mudou.
  const [confirmada, setConfirmada] = useState(false);
  const [senhaTxt, setSenhaTxt] = useState('');
  const [hist, setHist] = useState([]);
  const precisaSenha = reconf && !!adaptador.confirmarSenha && !confirmada;
  const falha = (r) => { setErro(r.erro); if (reconf && /Confirme sua senha/.test(r.erro || '')) { setConfirmada(false); setSenhaTxt(''); } };
  const profissionais = rotulo({ tipo }, 'profissional', { plural: true });

  // B9a: ao chegar no passo "Link do cliente", mostra o que já vale na loja (padrão de fábrica: exige tudo).
  useEffect(() => {
    if (etapa !== 'link' || !adaptador.linkObter) return undefined;
    let vivo = true;
    adaptador.linkObter().then((l) => {
      if (!vivo || !l.ok) return;
      const v = l.link.veiculoObrigatorio || [];
      setLinkCfg({ nome: l.link.nomeObrigatorio !== false, telefone: l.link.telefoneObrigatorio !== false, placa: v.includes('placa'), modelo: v.includes('modelo'), porte: v.includes('porte') });
    });
    return () => { vivo = false; };
  }, [etapa, adaptador]);

  const carregar = async () => {
    setFase('carregando'); setErroCarga('');
    const r = await adaptador.carregar();
    if (!r.ok) { setErroCarga(r.erro); setFase('erro'); return; }
    setEstado(r.estado);
    setExp(camposDoExpediente(r.estado.expediente || r.estado.expedienteSugerido));
    setBoxLinhas(r.estado.boxes && r.estado.boxes.length ? r.estado.boxes : ['Box 1']);
    const et = etapaDoPasso(r.estado.passo);
    setEtapa(reconf ? 'servicos' : r.estado.concluido ? 'pronto' : et === 'expediente' && r.estado.usaBox && !(r.estado.boxes || []).length ? 'boxes' : et); // retomou depois da equipe e ainda sem box: pede os boxes
    setMarcas(Object.fromEntries(r.estado.servicos.map((s) => [s.chave, { on: false, preco: String(s.preco).replace('.', ','), duracao: String(s.duracaoMin) }])));
    setProds(Object.fromEntries(produtosDoTipo(tipo).map((p) => [p.chave, { on: false, preco: pctTxt(p.preco), estoque: '' }])));
    const g = Number.isFinite(r.estado.comissaoPadrao) ? r.estado.comissaoPadrao : 50;
    setComGeral(g);
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

  const mudarNovo = (campo, valor) => { setNovo((n) => ({ ...n, [campo]: valor })); setErro(''); };
  // Confere o serviço descrito na hora e põe na lista (nada vai ao servidor antes do Continuar).
  const adicionarProprio = () => {
    const nome = novo.nome.trim().replace(/\s+/g, ' ');
    const preco = lerNumero(novo.preco); const dur = lerNumero(novo.duracao);
    if (nome.length < 2 || nome.length > 80) { setErro('Informe o nome do serviço (de 2 a 80 letras).'); return; }
    if (novo.categoria.trim().length > 60) { setErro('A categoria pode ter até 60 letras.'); return; }
    if (!(preco >= 0 && preco <= 100000)) { setErro('Confira o preço (de R$ 0 a R$ 100.000).'); return; }
    if (!(Number.isInteger(dur) && dur >= 1 && dur <= 14400)) { setErro('Confira a duração (minutos inteiros, a partir de 1).'); return; }
    const chave = nome.toLowerCase();
    if (proprios.some((p) => p.nome.toLowerCase() === chave) || (estado && estado.servicos.some((s) => s.nome.toLowerCase() === chave))) { setErro('Já existe um serviço com esse nome na lista.'); return; }
    if (proprios.length >= 20) { setErro('No máximo 20 serviços próprios por vez.'); return; }
    setProprios((l) => [...l, { nome, categoria: novo.categoria.trim(), preco: Math.round(preco * 100) / 100, duracao: dur }]);
    setNovo({ nome: '', categoria: '', preco: '', duracao: '' }); setErro('');
  };
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
    const r = await adaptador.servicos(itens, proprios.map((p) => ({ nome: p.nome, ...(p.categoria ? { categoria: p.categoria } : {}), preco: p.preco, duracaoMin: p.duracao })));
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    setProprios([]);
    setAviso(itens.length || proprios.length ? `${r.resultado.criados} ${r.resultado.criados === 1 ? 'serviço criado' : 'serviços criados'}.` : '');
    setEtapa('produtos');
  };

  // ----- produtos -----
  const sugeridos = useMemo(() => produtosDoTipo(tipo), [tipo]);
  const nomesProd = useMemo(() => new Set(estado ? (estado.produtosCadastrados || []).map((n) => n.toLowerCase()) : []), [estado]);
  const sugEscolhidos = sugeridos.filter((p) => prods[p.chave]?.on && !nomesProd.has(p.nome.toLowerCase()));
  const mudarProd = (chave, campo, valor) => { setProds((m) => ({ ...m, [chave]: { ...m[chave], [campo]: valor } })); setErro(''); };
  const mudarNovoProd = (campo, valor) => { setNovoProd((n) => ({ ...n, [campo]: valor })); setErro(''); };
  // Lê preço e estoque (vazio = 0) de um produto; devolve { erro } ou os números. A comissão sobre produtos é de cada pessoa (etapa Equipe).
  const lerProduto = (nome, t) => {
    const preco = lerNumero(t.preco);
    if (!(preco >= 0 && preco <= 100000)) return { erro: `Confira o preço de “${nome}” (de R$ 0 a R$ 100.000).` };
    const estoque = String(t.estoque).trim() === '' ? null : lerNumero(t.estoque);
    if (estoque !== null && !(estoque >= 0 && estoque <= 1000000)) return { erro: `Confira o estoque de “${nome}” (zero ou mais, ou deixe vazio).` };
    return { dados: { nome, preco: Math.round(preco * 100) / 100, ...(estoque ? { estoque } : {}) } };
  };
  const adicionarProdutoProprio = () => {
    const nome = novoProd.nome.trim().replace(/\s+/g, ' ');
    if (nome.length < 2 || nome.length > 100) { setErro('Informe o nome do produto (de 2 a 100 letras).'); return; }
    const chave = nome.toLowerCase();
    if (propriosProd.some((p) => p.nome.toLowerCase() === chave) || nomesProd.has(chave) || sugeridos.some((p) => p.nome.toLowerCase() === chave)) { setErro('Já existe um produto com esse nome na lista.'); return; }
    if (propriosProd.length >= 20) { setErro('No máximo 20 produtos próprios por vez.'); return; }
    const r = lerProduto(nome, novoProd);
    if (r.erro) { setErro(r.erro); return; }
    setPropriosProd((l) => [...l, r.dados]);
    setNovoProd({ nome: '', preco: '', estoque: '' }); setErro('');
  };
  const enviarProdutos = async () => {
    if (enviando) return;
    const itens = [];
    for (const p of sugEscolhidos) { const r = lerProduto(p.nome, prods[p.chave]); if (r.erro) { setErro(r.erro); return; } itens.push(r.dados); }
    itens.push(...propriosProd);
    setEnviando(true); setErro('');
    const r = await adaptador.produtos(itens);
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    setPropriosProd([]);
    setAviso(itens.length ? `${r.resultado.criados} ${r.resultado.criados === 1 ? 'produto criado' : 'produtos criados'}.` : '');
    setEtapa('equipe');
  };

  // ----- equipe (com a comissão de cada pessoa) -----
  const mudarLinha = (i, campo, valor) => { setLinhas((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x))); setErro(''); };
  const enviarEquipe = async () => {
    if (enviando) return;
    const pessoas = [];
    for (const l of linhas) {
      const nome = l.nome.trim();
      if (!nome) continue;
      if (nome.length > 80) { setErro('Cada nome pode ter até 80 letras.'); return; }
      const pessoa = { nome, atende: l.atende };
      if (l.modo === 'propria') {
        const v = lerNumero(l.pct);
        if (!(String(l.pct).trim() !== '' && v >= 0 && v <= 100)) { setErro(`Confira a comissão de “${nome}” (de 0 a 100%).`); return; }
        pessoa.comissaoPct = Math.round(v * 100) / 100;
      }
      if (l.modoProd === 'propria') {
        const v = lerNumero(l.pctProd);
        if (!(String(l.pctProd).trim() !== '' && v >= 0 && v <= 100)) { setErro(`Confira a comissão sobre produtos de “${nome}” (de 0 a 100%).`); return; }
        pessoa.comissaoProdutoPct = Math.round(v * 100) / 100;
      }
      pessoas.push(pessoa);
    }
    setEnviando(true); setErro('');
    const r = await adaptador.equipe(pessoas);
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    if (!pessoas.length) { setEtapa(depoisDaEquipe); return; }
    setCriadas(r.pessoas);
  };

  const usaBox = !!(estado && estado.usaBox) && cap({ tipo }, 'usaRecursoFisico');
  const depoisDaEquipe = usaBox ? 'boxes' : 'expediente';
  const enviarBoxes = async () => {
    if (enviando) return;
    const nomes = boxLinhas.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!nomes.length) { setErro('Informe ao menos um box.'); return; }
    if (nomes.some((n) => n.length > 30)) { setErro('Cada box pode ter até 30 letras.'); return; }
    if (new Set(nomes.map((n) => n.toLowerCase())).size !== nomes.length) { setErro('Dois boxes têm o mesmo nome.'); return; }
    setEnviando(true); setErro('');
    const r = await adaptador.boxes(nomes);
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    setEtapa('expediente');
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
    setEtapa(adaptador.link ? 'link' : 'pronto');
  };
  const pularExpediente = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await adaptador.expediente({});
    setEnviando(false);
    if (!r.ok) { falha(r); return; }
    setEtapa(adaptador.link ? 'link' : 'pronto');
  };

  // B9a: Link do cliente. Os campos que o cliente precisa preencher ao pedir horário pelo link (nome, telefone e, nos tipos com veículo, placa/modelo/porte).
  const usaVeiculo = cap({ tipo }, 'usaVeiculo');
  const alternarLink = (campo) => { setLinkCfg((c) => ({ ...c, [campo]: !c[campo] })); setErro(''); };
  const enviarLink = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    const veiculoObrigatorio = usaVeiculo ? ['placa', 'modelo', 'porte'].filter((k) => linkCfg[k]) : undefined;
    const r = await adaptador.link({ nomeObrigatorio: linkCfg.nome, telefoneObrigatorio: linkCfg.telefone, ...(veiculoObrigatorio ? { veiculoObrigatorio } : {}) });
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

  const base = usaBox ? ETAPAS_BOX : ETAPAS;
  const etapas = adaptador.link ? [...base.slice(0, -1), ETAPA_LINK, base[base.length - 1]] : base;
  const indice = etapas.findIndex((e) => e[0] === etapa);
  const Raiz = reconf ? 'div' : 'main';
  return (
    <Raiz className={reconf ? 'pa pa-embutido' : 'login pa'} data-testid="pa">
      <div className="login-cartao pa-cartao">
        <header className="pa-topo">
          {reconf && aoCancelar && <div className="acoes"><Btn tamanho="sm" onClick={aoCancelar} data-testid="pa-voltar">Voltar</Btn></div>}
          <h1>{reconf ? `Reconfigurar ${nomeLoja || 'sua loja'}` : `Vamos preparar ${nomeLoja || 'sua loja'}`}</h1>
          {reconf && <p className="muted" data-testid="pa-reconf-nota">Aqui você só adiciona: serviços, produtos e pessoas que já existem continuam como estão e ninguém é excluído. O horário de funcionamento, se você salvar, substitui o atual. Dá para desfazer pelo histórico abaixo (por 30 dias).</p>}
          {previa && <Aviso data-testid="pa-previa">Pré-visualização: nada do que você marcar aqui é gravado.</Aviso>}
          {!precisaSenha && <ol className="pa-passos" aria-label="Etapas">
            {etapas.map(([id, nome], i) => <li key={id} className={i === indice ? 'atual' : i < indice ? 'feito' : ''} aria-current={i === indice ? 'step' : undefined} data-testid={`pa-etapa-${id}`}><span>{i + 1}</span> {nome}</li>)}
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
                  <span className="muted"> · {h.servicosCriados} {h.servicosCriados === 1 ? 'serviço' : 'serviços'}, {h.produtosCriados} {h.produtosCriados === 1 ? 'produto' : 'produtos'}, {h.pessoasCriadas} {h.pessoasCriadas === 1 ? 'pessoa' : 'pessoas'}{h.comissaoTrocada ? ', comissão geral' : ''}{h.linkTrocado ? ', campos do link' : ''}{h.expedienteTrocado ? ', horário de funcionamento' : ''}</span>
                  <div className="acoes">
                    {h.podeDesfazer && <Btn tamanho="sm" disabled={enviando} onClick={() => trocarReconf(h, true)} data-testid={`pa-reconf-desfazer-${h.id}`}>Desfazer</Btn>}
                    {h.podeRefazer && <Btn tamanho="sm" disabled={enviando} onClick={() => trocarReconf(h, false)} data-testid={`pa-reconf-refazer-${h.id}`}>Refazer</Btn>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted">Desfazer devolve o horário de funcionamento de antes e desativa os serviços, os produtos e as pessoas criados naquela vez (nada é excluído). Só a mais recente pode ser desfeita, e por 30 dias.</p>
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
            <div className="pa-proprio" data-testid="pa-proprio">
              <h3>Não achou o seu? Descreva o serviço</h3>
              {proprios.length > 0 && (
                <ul className="pa-lista" data-testid="pa-proprios-lista">
                  {proprios.map((p, i) => (
                    <li className="pa-item marcado" key={p.nome} data-testid={`pa-proprio-${i}`}>
                      <span><b>{p.nome}</b>{p.categoria ? <small className="muted"> · {p.categoria}</small> : null}<small className="muted"> · {dinheiro(p.preco)} · {p.duracao} min</small></span>
                      <Btn tamanho="sm" onClick={() => setProprios((l) => l.filter((_, j) => j !== i))} aria-label={`Remover ${p.nome}`} data-testid={`pa-proprio-remover-${i}`}>Remover</Btn>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pa-campos">
                <Campo rotulo="Nome do serviço"><input value={novo.nome} onChange={(e) => mudarNovo('nome', e.target.value)} maxLength={80} data-testid="pa-proprio-nome" /></Campo>
                <Campo rotulo="Categoria (opcional)"><input value={novo.categoria} onChange={(e) => mudarNovo('categoria', e.target.value)} maxLength={60} data-testid="pa-proprio-categoria" /></Campo>
                <Campo rotulo="Preço (R$)"><input inputMode="decimal" value={novo.preco} onChange={(e) => mudarNovo('preco', e.target.value)} maxLength={9} data-testid="pa-proprio-preco" /></Campo>
                <Campo rotulo="Duração (min)"><input inputMode="numeric" value={novo.duracao} onChange={(e) => mudarNovo('duracao', e.target.value)} maxLength={5} data-testid="pa-proprio-duracao" /></Campo>
              </div>
              <div className="acoes"><Btn tamanho="sm" onClick={adicionarProprio} data-testid="pa-proprio-adicionar">Adicionar à lista</Btn></div>
              {estado.servicos.some((s) => s.precos) && <p className="muted">Neste tipo de loja o preço vale para todos os portes; ajuste cada porte depois, em Serviços.</p>}
            </div>
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn onClick={() => { setAviso(''); setEtapa('produtos'); }} data-testid="pa-pular-servicos">Pular</Btn>
              <Btn variante="primario" disabled={enviando || !(escolhidos.length + proprios.length)} onClick={enviarServicos} data-testid="pa-continuar-servicos">{enviando ? 'Salvando…' : `Continuar${escolhidos.length + proprios.length ? ` (${escolhidos.length + proprios.length})` : ''}`}</Btn>
            </div>
          </section>
        )}

        {fase === 'ok' && !precisaSenha && etapa === 'produtos' && (
          <section data-testid="pa-produtos">
            {aviso && <Aviso data-testid="pa-aviso">{aviso}</Aviso>}
            <p>Vende produtos além dos serviços? Marque os que a loja vende e ajuste o preço. O estoque inicial é opcional. A comissão sobre produtos é de cada pessoa e você define na etapa Equipe. Nada vem marcado; dá para mudar tudo depois, em Estoque.</p>
            {sugeridos.length > 0 && (
              <ul className="pa-lista">
                {sugeridos.map((p) => {
                  const m = prods[p.chave] || {};
                  const existe = nomesProd.has(p.nome.toLowerCase());
                  return (
                    <li key={p.chave} className={`pa-item${m.on ? ' marcado' : ''}`} data-testid={`pa-prod-item-${p.chave}`}>
                      <label className="pa-marcar">
                        <input type="checkbox" checked={!!m.on || existe} disabled={existe} onChange={(e) => mudarProd(p.chave, 'on', e.target.checked)} data-testid={`pa-prod-marcar-${p.chave}`} />
                        <span><b>{p.nome}</b>{existe ? <small className="muted"> · já está na sua loja</small> : null}</span>
                      </label>
                      {m.on && !existe && (
                        <div className="pa-campos">
                          <Campo rotulo="Preço (R$)"><input inputMode="decimal" value={m.preco} onChange={(e) => mudarProd(p.chave, 'preco', e.target.value)} maxLength={9} data-testid={`pa-prod-preco-${p.chave}`} /></Campo>
                          <Campo rotulo="Estoque"><input inputMode="decimal" value={m.estoque} onChange={(e) => mudarProd(p.chave, 'estoque', e.target.value)} maxLength={9} placeholder="0" data-testid={`pa-prod-estoque-${p.chave}`} /></Campo>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="pa-proprio" data-testid="pa-prod-proprio">
              <h3>{sugeridos.length ? 'Não achou o seu? Descreva o produto' : 'Descreva o produto'}</h3>
              {propriosProd.length > 0 && (
                <ul className="pa-lista" data-testid="pa-prod-proprios-lista">
                  {propriosProd.map((p, i) => (
                    <li className="pa-item marcado" key={p.nome} data-testid={`pa-prod-proprio-${i}`}>
                      <span><b>{p.nome}</b><small className="muted"> · {dinheiro(p.preco)}{p.estoque ? ` · estoque ${pctTxt(p.estoque)}` : ''}</small></span>
                      <Btn tamanho="sm" onClick={() => setPropriosProd((l) => l.filter((_, j) => j !== i))} aria-label={`Remover ${p.nome}`} data-testid={`pa-prod-proprio-remover-${i}`}>Remover</Btn>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pa-campos">
                <Campo rotulo="Nome do produto"><input value={novoProd.nome} onChange={(e) => mudarNovoProd('nome', e.target.value)} maxLength={100} data-testid="pa-prod-nome" /></Campo>
                <Campo rotulo="Preço (R$)"><input inputMode="decimal" value={novoProd.preco} onChange={(e) => mudarNovoProd('preco', e.target.value)} maxLength={9} data-testid="pa-prod-novo-preco" /></Campo>
                <Campo rotulo="Estoque"><input inputMode="decimal" value={novoProd.estoque} onChange={(e) => mudarNovoProd('estoque', e.target.value)} maxLength={9} placeholder="0" data-testid="pa-prod-novo-estoque" /></Campo>
              </div>
              <div className="acoes"><Btn tamanho="sm" onClick={adicionarProdutoProprio} data-testid="pa-prod-adicionar">Adicionar à lista</Btn></div>
            </div>
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn onClick={() => { setErro(''); setEtapa('equipe'); }} data-testid="pa-pular-produtos">Pular</Btn>
              <Btn variante="primario" disabled={enviando || !(sugEscolhidos.length + propriosProd.length)} onClick={enviarProdutos} data-testid="pa-continuar-produtos">{enviando ? 'Salvando…' : `Continuar${sugEscolhidos.length + propriosProd.length ? ` (${sugEscolhidos.length + propriosProd.length})` : ''}`}</Btn>
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
                  <Campo rotulo="Comissão sobre os serviços">
                    <select value={l.modo} onChange={(e) => mudarLinha(i, 'modo', e.target.value)} data-testid={`pa-comissao-modo-${i}`}>
                      <option value="geral">Usar a geral da loja ({pctTxt(comGeral)}%)</option>
                      <option value="propria">Percentual próprio</option>
                    </select>
                  </Campo>
                  {l.modo === 'propria' && <Campo rotulo="Percentual sobre serviços (%)"><input inputMode="decimal" value={l.pct} onChange={(e) => mudarLinha(i, 'pct', e.target.value)} maxLength={6} data-testid={`pa-comissao-pct-${i}`} /></Campo>}
                  <Campo rotulo="Comissão sobre os produtos">
                    <select value={l.modoProd} onChange={(e) => mudarLinha(i, 'modoProd', e.target.value)} data-testid={`pa-comissao-prod-modo-${i}`}>
                      <option value="sem">Sem comissão sobre produtos</option>
                      <option value="propria">Percentual próprio</option>
                    </select>
                  </Campo>
                  {l.modoProd === 'propria' && <Campo rotulo="Percentual sobre produtos (%)"><input inputMode="decimal" value={l.pctProd} onChange={(e) => mudarLinha(i, 'pctProd', e.target.value)} maxLength={6} data-testid={`pa-comissao-prod-pct-${i}`} /></Campo>}
                  {linhas.length > 1 && <button type="button" className="btn btn-neutro btn-sm" onClick={() => setLinhas((x) => x.filter((_, j) => j !== i))} aria-label={`Remover o nome ${i + 1}`} data-testid={`pa-remover-${i}`}><Icone n="x" size={15} /></button>}
                </li>
              ))}
            </ul>
            {linhas.length < 10 && <div className="acoes"><Btn tamanho="sm" onClick={() => setLinhas((l) => [...l, linhaNova()])} data-testid="pa-add">Adicionar pessoa</Btn></div>}
            <p className="muted">Os {profissionais} que “atendem clientes” aparecem na agenda. Comissão sobre serviços: o serviço com percentual próprio vale sobre o da pessoa, e o da pessoa vale sobre o geral da loja (0% é sem comissão). Sobre produtos: vale o percentual do próprio produto, se ele tiver; senão o da pessoa que vendeu. O proprietário que atende fica com 100% a menos que tenha percentual próprio.</p>
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn onClick={() => { setAviso(''); setEtapa(depoisDaEquipe); }} data-testid="pa-pular-equipe">Pular</Btn>
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
            <div className="acoes pa-acoes"><Btn variante="primario" onClick={() => { setErro(''); setEtapa(depoisDaEquipe); }} data-testid="pa-anotei">Anotei, continuar</Btn></div>
          </section>
        )}

        {fase === 'ok' && !precisaSenha && etapa === 'boxes' && usaBox && (
          <section data-testid="pa-boxes">
            <p>Em quais boxes (vagas) a loja atende? Sem box cadastrado a agenda não aceita carro e o link do cliente fica sem horários. Dois carros não ocupam o mesmo box ao mesmo tempo. {reconf ? 'Os que já existem não são recriados nem removidos.' : 'Dá para renomear e incluir mais depois, em Estabelecimento > Boxes.'}</p>
            <ul className="pa-lista">
              {boxLinhas.map((n, i) => (
                <li key={i} className="pa-linha">
                  <Campo rotulo={`Box ${i + 1}`}><input value={n} maxLength={30} onChange={(e) => { setBoxLinhas((l) => l.map((x, j) => (j === i ? e.target.value : x))); setErro(''); }} data-testid={`pa-box-${i}`} /></Campo>
                  {boxLinhas.length > 1 && <button type="button" className="btn btn-neutro btn-sm" onClick={() => setBoxLinhas((l) => l.filter((_, j) => j !== i))} aria-label={`Remover o box ${i + 1}`} data-testid={`pa-box-remover-${i}`}><Icone n="x" size={15} /></button>}
                </li>
              ))}
            </ul>
            {boxLinhas.length < 20 && <div className="acoes"><Btn tamanho="sm" onClick={() => setBoxLinhas((l) => [...l, `Box ${l.length + 1}`])} data-testid="pa-box-add">Adicionar box</Btn></div>}
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn variante="primario" disabled={enviando} onClick={enviarBoxes} data-testid="pa-continuar-boxes">{enviando ? 'Salvando…' : 'Continuar'}</Btn>
            </div>
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

        {fase === 'ok' && !precisaSenha && etapa === 'link' && (
          <section data-testid="pa-link">
            <p>O que o cliente precisa informar ao pedir um horário pelo seu link? Marque só o que for obrigatório; o resto fica opcional. Dá para mudar depois em Estabelecimento.</p>
            <fieldset className="pa-dias"><legend>Obrigatório no link</legend>
              <label className="pa-check"><input type="checkbox" checked={linkCfg.nome} onChange={() => alternarLink('nome')} data-testid="pa-link-nome" /> Nome</label>
              <label className="pa-check"><input type="checkbox" checked={linkCfg.telefone} onChange={() => alternarLink('telefone')} data-testid="pa-link-telefone" /> Telefone</label>
              {usaVeiculo && ['placa', 'modelo', 'porte'].map((k) => (
                <label key={k} className="pa-check"><input type="checkbox" checked={linkCfg[k]} onChange={() => alternarLink(k)} data-testid={`pa-link-${k}`} /> {{ placa: 'Placa do veículo', modelo: 'Modelo do veículo', porte: 'Porte do veículo' }[k]}</label>
              ))}
            </fieldset>
            {!linkCfg.nome && !linkCfg.telefone && <p className="muted" data-testid="pa-link-aviso">Sem nome e sem telefone o pedido fica anônimo na agenda.</p>}
            {erro && <Aviso tipo="erro" data-testid="pa-erro">{erro}</Aviso>}
            <div className="acoes pa-acoes">
              <Btn onClick={() => setEtapa('pronto')} disabled={enviando} data-testid="pa-pular-link">Pular</Btn>
              <Btn variante="primario" disabled={enviando} onClick={enviarLink} data-testid="pa-continuar-link">{enviando ? 'Salvando…' : 'Continuar'}</Btn>
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
