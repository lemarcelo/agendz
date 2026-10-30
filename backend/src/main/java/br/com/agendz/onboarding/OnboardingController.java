package br.com.agendz.onboarding;

import br.com.agendz.comissao.Comissao;
import br.com.agendz.configuracao.ComissaoGeralController;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.escala.EscalaService.Dia;
import br.com.agendz.escala.EscalaService.Escala;
import br.com.agendz.escala.EscalaService.Faixa;
import br.com.agendz.onboarding.CatalogoDeServicos.Catalogo;
import br.com.agendz.onboarding.CatalogoDeServicos.Item;
import br.com.agendz.produtos.ProdutoService;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Assistente de primeiro acesso (docs/F3-primeiro-acesso.md). Só o dono. A loja é a do Host; a tabela `onboarding` tem RLS; o catálogo é o do
 * TIPO da loja (nunca do corpo). Cada passo é opcional: lista vazia = pular.
 * Depois de concluído o assistente pode ser REABERTO pelo dono (Estabelecimento > Reconfigurar): os mesmos passos continuam valendo, só que
 * ADITIVOS: serviços novos entram (os que já existem ficam como estão), pessoas novas são criadas (ninguém é excluído ou alterado) e o expediente
 * da loja é substituído pelo enviado. Nada aqui apaga dado. O passo registrado (`pronto`) e `concluido_em` não mudam.
 * A senha temporária de cada profissional criado aparece UMA vez na resposta (sem cache) e só o hash fica salvo.
 */
@RestController
@PreAuthorize("hasRole('DONO')")
public class OnboardingController {


    public record Estado(String tipo, String passo, boolean concluido, List<Item> servicos, List<String> jaCadastrados, Escala expedienteSugerido, Escala expediente,
                         BigDecimal comissaoPadrao, List<String> produtosCadastrados) {
    }

    public record ItemEscolhido(
            @NotBlank @Size(max = 40) @Pattern(regexp = "^[a-z0-9-]{1,40}$", message = "chave inválida") String chave,
            @DecimalMin("0") @DecimalMax("100000") BigDecimal preco,
            @Min(1) @Max(14400) Integer duracaoMin) {
    }

    /** Serviço que o dono descreve na hora (fora do catálogo de exemplos). Nos tipos com preço por porte, o mesmo preço e a mesma duração valem para todos os portes (ajuste fino em Serviços). */
    public record ItemProprio(
            @NotBlank @Size(min = 2, max = 80) String nome,
            @Size(max = 60) String categoria,
            @NotNull @DecimalMin("0") @DecimalMax("100000") BigDecimal preco,
            @NotNull @Min(1) @Max(14400) Integer duracaoMin) {
    }

    public record Servicos(@NotNull @Size(max = 40) List<@Valid @NotNull ItemEscolhido> itens, @Size(max = 20) List<@Valid @NotNull ItemProprio> proprios) {
    }

    public record Resultado(int criados, int jaExistiam) {
    }

    public record NovaPessoa(@NotBlank @Size(max = 80) String nome, Boolean atende, @DecimalMin("0") @DecimalMax("100") BigDecimal comissaoPct,
                             @DecimalMin("0") @DecimalMax("100") BigDecimal comissaoProdutoPct) {
    }

    public record Equipe(@NotNull @Size(max = 10) List<@Valid @NotNull NovaPessoa> pessoas) {
    }

    /** Comissão geral da loja (a última da ordem serviço > funcionário > estabelecimento). `padrao` ausente = pular (nada é gravado). */
    public record ComissaoGeral(@DecimalMin("0") @DecimalMax("100") BigDecimal padrao) {
    }

    /** Produto à venda que o dono cadastra no assistente. Comissão ausente ou 0 = sem comissão; estoque ausente = 0. */
    public record ProdutoNovo(@NotBlank @Size(max = 100) String nome, @NotNull @DecimalMin("0") @DecimalMax("100000") BigDecimal preco,
                              @DecimalMin("0") @DecimalMax("100") BigDecimal comissaoPct, @DecimalMin("0") @DecimalMax("1000000000") BigDecimal estoque) {
    }

    public record Produtos(@NotNull @Size(max = 30) List<@Valid @NotNull ProdutoNovo> itens) {
    }

    public record PessoaCriada(String nome, String login, String senhaTemporaria, boolean atende) {
    }

    public record EquipeCriada(List<PessoaCriada> pessoas) {
    }

    /** `semana` ausente ou sem nenhum dia aberto = pular (nada é gravado). */
    public record Expediente(Map<Integer, @Valid Dia> semana) {
    }

    private record Linha(String passo, boolean concluido) {
    }

    private final LojaJdbc banco;
    private final CatalogoDeServicos catalogos;
    private final PasswordEncoder encoder;
    private final ObjectMapper json;
    private final EscalaService escalas;
    private final ReconfiguracaoService reconfiguracoes;
    private final ProdutoService produtosDaLoja;
    private final br.com.agendz.interno.RegrasDaLoja regras;

    public OnboardingController(LojaJdbc banco, CatalogoDeServicos catalogos, PasswordEncoder encoder, ObjectMapper json, EscalaService escalas, ReconfiguracaoService reconfiguracoes,
                                ProdutoService produtosDaLoja, br.com.agendz.interno.RegrasDaLoja regras) {
        this.regras = regras;
        this.reconfiguracoes = reconfiguracoes;
        this.produtosDaLoja = produtosDaLoja;
        this.banco = banco;
        this.catalogos = catalogos;
        this.encoder = encoder;
        this.json = json;
        this.escalas = escalas;
    }

    @GetMapping("/api/onboarding")
    public Estado estado() {
        Loja loja = LojaContext.exigir();
        Linha l = linha();
        Catalogo c = catalogos.doTipo(loja.tipo()).orElse(new Catalogo(loja.tipo(), null, List.of()));
        Set<String> nomes = new HashSet<>(banco.naLoja(jdbc -> jdbc.queryForList("select lower(nome) from servico", String.class)));
        List<String> ja = c.servicos().stream().filter((s) -> nomes.contains(s.nome().toLowerCase(Locale.ROOT))).map(Item::chave).toList();
        Map<Integer, List<Faixa>> atual = banco.naLoja((jdbc) -> escalas.ler(jdbc, null));
        List<String> produtos = banco.naLoja(jdbc -> jdbc.queryForList("select nome from material where tipo = 'produto' and ativo order by lower(nome) limit 200", String.class));
        return new Estado(loja.tipo(), l.passo(), l.concluido(), c.servicos(), ja, c.expediente(), EscalaService.temFaixa(atual) ? EscalaService.paraJson(atual) : null,
                ComissaoGeralController.efetiva(banco), produtos);
    }

    @PostMapping("/api/onboarding/servicos")
    public Resultado servicos(@Valid @RequestBody Servicos corpo, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        linha(); // 404 se a loja não tem o assistente
        Catalogo c = catalogos.doTipo(loja.tipo()).orElseThrow(() -> new ErroDeNegocio(HttpStatus.NOT_FOUND, "Não há exemplos para este tipo de estabelecimento"));
        Map<String, Item> porChave = new LinkedHashMap<>();
        c.servicos().forEach((s) -> porChave.put(s.chave(), s));
        Map<String, ItemEscolhido> escolhidos = new LinkedHashMap<>();
        for (ItemEscolhido e : corpo.itens()) {
            if (!porChave.containsKey(e.chave())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Serviço de exemplo desconhecido: " + Texto.limpar(e.chave()));
            escolhidos.putIfAbsent(e.chave(), e);
        }
        List<ItemProprio> proprios = corpo.proprios() == null ? List.of() : corpo.proprios();
        // portes e prazos do tipo (se o catálogo tem preço por porte): o serviço próprio repete o mesmo preço e a mesma duração em todos
        Item modeloPorte = c.servicos().stream().filter((x) -> x.precos() != null && x.duracoes() != null).findFirst().orElse(null);
        int[] contagem = new int[2];
        UUID quem = UUID.fromString(jwt.getSubject());
        banco.naLoja(jdbc -> {
            UUID reconf = reconfiguracoes.autorizada(jdbc, quem); // concluído: só com a senha confirmada (403 sem ela)
            Set<String> nomes = new HashSet<>(jdbc.queryForList("select lower(nome) from servico", String.class));
            for (ItemEscolhido e : escolhidos.values()) {
                Item s = porChave.get(e.chave());
                if (!nomes.add(s.nome().toLowerCase(Locale.ROOT))) {
                    contagem[1]++;
                    continue;
                }
                boolean porPorte = s.precos() != null;
                BigDecimal preco = porPorte || e.preco() == null ? s.preco() : e.preco(); // serviço com preço por porte não muda o preço aqui (isso é na tela de Serviços)
                int duracao = porPorte || e.duracaoMin() == null ? s.duracaoMin() : e.duracaoMin();
                UUID novo = jdbc.queryForObject("insert into servico (loja_id, codigo, nome, categoria, preco, duracao_min, intervalo_min, multi_dia, ativo, precos, duracoes) "
                                + "values (?::uuid, (select (coalesce(max(case when codigo ~ '^[0-9]{1,9}$' then codigo::int end), 0) + 1)::text from servico), "
                                + "?, nullif(?, ''), ?, ?, ?, ?, true, cast(? as jsonb), cast(? as jsonb)) returning id", UUID.class,
                        loja.id().toString(), s.nome(), s.categoria() == null ? "" : s.categoria(), preco.setScale(2, RoundingMode.HALF_UP), duracao, s.intervaloMin(), s.multiDia(),
                        escrever(s.precos()), escrever(s.duracoes()));
                reconfiguracoes.anotarServico(jdbc, reconf, novo);
                contagem[0]++;
            }
            for (ItemProprio p : proprios) {
                String nome = Texto.limpar(p.nome()).trim();
                String categoria = p.categoria() == null ? "" : Texto.limpar(p.categoria()).trim();
                if (nome.length() < 2) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o nome do serviço (de 2 a 80 letras)");
                if (!nomes.add(nome.toLowerCase(Locale.ROOT))) {
                    contagem[1]++;
                    continue;
                }
                BigDecimal preco = p.preco().setScale(2, RoundingMode.HALF_UP);
                Map<String, BigDecimal> precos = null;
                Map<String, Integer> duracoes = null;
                if (modeloPorte != null) {
                    precos = new LinkedHashMap<>();
                    duracoes = new LinkedHashMap<>();
                    for (String porte : modeloPorte.precos().keySet()) {
                        precos.put(porte, preco);
                        duracoes.put(porte, p.duracaoMin());
                    }
                }
                UUID novo = jdbc.queryForObject("insert into servico (loja_id, codigo, nome, categoria, preco, duracao_min, intervalo_min, multi_dia, ativo, precos, duracoes) "
                                + "values (?::uuid, (select (coalesce(max(case when codigo ~ '^[0-9]{1,9}$' then codigo::int end), 0) + 1)::text from servico), "
                                + "?, nullif(?, ''), ?, ?, 0, false, true, cast(? as jsonb), cast(? as jsonb)) returning id", UUID.class,
                        loja.id().toString(), nome, categoria, preco, p.duracaoMin(), escrever(precos), escrever(duracoes));
                reconfiguracoes.anotarServico(jdbc, reconf, novo);
                contagem[0]++;
            }
            jdbc.update("update onboarding set passo = 'equipe', atualizado_em = now() where concluido_em is null and passo in ('senha', 'servicos')");
            return null;
        });
        return new Resultado(contagem[0], contagem[1]);
    }

    @PostMapping("/api/onboarding/equipe")
    public ResponseEntity<EquipeCriada> equipe(@Valid @RequestBody Equipe corpo, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        linha(); // 404 se a loja não tem o assistente
        UUID quem = UUID.fromString(jwt.getSubject());
        List<PessoaCriada> criadas = banco.naLoja(jdbc -> {
            UUID reconf = reconfiguracoes.autorizada(jdbc, quem);
            Set<String> logins = new HashSet<>(jdbc.queryForList("select identificador from usuario", String.class));
            Integer ativos = jdbc.queryForObject("select count(*) from usuario where ativo and " + br.com.agendz.validacao.Reservados.OCULTOS_SQL, Integer.class);
            List<PessoaCriada> saida = new ArrayList<>();
            for (NovaPessoa p : corpo.pessoas()) {
                regras.exigirVagaDeUsuario(loja.id(), (ativos == null ? 0 : ativos) + saida.size()); // limite de usuários da plataforma (Admin): o assistente não passa por cima
                String nome = Texto.limpar(p.nome());
                if (nome.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o nome");
                br.com.agendz.validacao.Reservados.exigirLivre(nome);
                String login = loginLivre(nome, logins);
                logins.add(login);
                String senha = senhaTemporaria();
                boolean atende = p.atende() == null || p.atende();
                if (p.comissaoPct() != null && !Comissao.valido(p.comissaoPct())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A comissão vai de 0 a 100%.");
                BigDecimal comissao = p.comissaoPct() == null ? null : p.comissaoPct().setScale(2, RoundingMode.HALF_UP); // null = usa a comissão geral da loja
                if (p.comissaoProdutoPct() != null && !Comissao.valido(p.comissaoProdutoPct())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A comissão vai de 0 a 100%.");
                BigDecimal comissaoProduto = p.comissaoProdutoPct() == null ? null : p.comissaoProdutoPct().setScale(2, RoundingMode.HALF_UP); // null = sem comissão sobre produtos (a menos que o produto tenha a sua)
                UUID novo = jdbc.queryForObject("insert into usuario (loja_id, identificador, nome, papel, senha_hash, atende, deve_trocar_senha, comissao_pct, comissao_produto_pct) values (?::uuid, ?, ?, 'profissional', ?, ?, true, ?, ?) returning id",
                        UUID.class, loja.id().toString(), login, nome, encoder.encode(senha), atende, comissao, comissaoProduto);
                reconfiguracoes.anotarPessoa(jdbc, reconf, novo);
                saida.add(new PessoaCriada(nome, login, senha, atende));
            }
            jdbc.update("update onboarding set passo = 'expediente', atualizado_em = now() where concluido_em is null and passo in ('senha', 'servicos', 'equipe')");
            return saida;
        });
        // A resposta traz senhas: nada de cache no navegador nem em proxy.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new EquipeCriada(criadas));
    }

    /** Comissão geral no assistente (ou no Reconfigurar, com a senha). Sem `padrao` = pular. Dentro de uma reconfiguração guarda o valor de antes para o Desfazer. */
    @PostMapping("/api/onboarding/comissao")
    public ResponseEntity<ComissaoGeral> comissao(@Valid @RequestBody ComissaoGeral corpo, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        linha(); // 404 se a loja não tem o assistente
        UUID quem = UUID.fromString(jwt.getSubject());
        BigDecimal novo = corpo.padrao() == null ? null : corpo.padrao().setScale(2, RoundingMode.HALF_UP);
        banco.naLoja(jdbc -> {
            UUID reconf = reconfiguracoes.autorizada(jdbc, quem);
            if (novo != null) {
                List<BigDecimal> atual = jdbc.query("select comissao_padrao from configuracao_loja", (rs, i) -> rs.getBigDecimal(1));
                reconfiguracoes.anotarComissao(jdbc, reconf, atual.isEmpty() ? null : atual.get(0), novo);
                reconfiguracoes.gravarComissaoGeral(jdbc, loja.id(), novo);
            }
            return null;
        });
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new ComissaoGeral(ComissaoGeralController.efetiva(banco)));
    }

    /** Produtos à venda no assistente. Nome que já existe na loja não é recriado (conta em `jaExistiam`); vale para o Reconfigurar com a senha. */
    @PostMapping("/api/onboarding/produtos")
    public Resultado produtos(@Valid @RequestBody Produtos corpo, @AuthenticationPrincipal Jwt jwt) {
        linha(); // 404 se a loja não tem o assistente
        UUID quem = UUID.fromString(jwt.getSubject());
        int[] contagem = banco.naLoja(jdbc -> {
            UUID reconf = reconfiguracoes.autorizada(jdbc, quem);
            int criados = 0;
            int jaExistiam = 0;
            for (ProdutoNovo p : corpo.itens()) {
                ProdutoService.Produto feito = produtosDaLoja.criarSeNovo(jdbc, new ProdutoService.Dados(p.nome(), null, null, p.preco(), p.comissaoPct(), p.estoque(), null, null, null));
                if (feito == null) {
                    jaExistiam++;
                } else {
                    criados++;
                    reconfiguracoes.anotarProduto(jdbc, reconf, feito.id());
                }
            }
            return new int[]{criados, jaExistiam};
        });
        return new Resultado(contagem[0], contagem[1]);
    }

    @PostMapping("/api/onboarding/expediente")
    public Resultado expediente(@Valid @RequestBody Expediente corpo, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        linha(); // 404 se a loja não tem o assistente
        Map<Integer, List<Faixa>> semana = corpo.semana() == null ? null : EscalaService.validar(new Escala(corpo.semana()));
        boolean grava = semana != null && EscalaService.temFaixa(semana);
        UUID quem = UUID.fromString(jwt.getSubject());
        banco.naLoja((jdbc) -> {
            UUID reconf = reconfiguracoes.autorizada(jdbc, quem);
            if (grava) {
                escalas.gravar(jdbc, loja.id(), null, semana);
                reconfiguracoes.anotarExpediente(jdbc, reconf);
            }
            jdbc.update("update onboarding set passo = 'pronto', atualizado_em = now() where concluido_em is null and passo <> 'pronto'");
            return null;
        });
        return new Resultado(grava ? 1 : 0, 0);
    }

    @PostMapping("/api/onboarding/concluir")
    public Estado concluir() {
        Loja loja = LojaContext.exigir();
        linha();
        banco.naLoja(jdbc -> {
            // tipo com box (estética): sem nenhum box a agenda não aceita carro; cria um por profissional que atende (de 1 a 20), que o dono renomeia em Estabelecimento > Boxes
            if (br.com.agendz.tenant.Capacidades.usaRecursoFisico(loja)) {
                Integer boxes = jdbc.queryForObject("select count(*) from box", Integer.class);
                if (boxes != null && boxes == 0) {
                    Integer atendem = jdbc.queryForObject("select count(*) from usuario where ativo and atende", Integer.class);
                    int n = Math.max(1, Math.min(20, atendem == null ? 1 : atendem));
                    Integer limite = regras.ler(loja.id()).limiteAgendas(); // limite de agendas da plataforma (Admin): cria só as que cabem (nunca menos de 1)
                    if (limite != null) n = Math.max(1, Math.min(n, limite));
                    for (int i = 1; i <= n; i++) jdbc.update("insert into box (loja_id, nome, ordem) values (?::uuid, ?, ?)", loja.id().toString(), "Box " + i, i - 1);
                }
            }
            return jdbc.update("update onboarding set passo = 'pronto', concluido_em = coalesce(concluido_em, now()), atualizado_em = now()");
        });
        return new Estado(loja.tipo(), "pronto", true, List.of(), List.of(), null, null, null, List.of());
    }

    private Linha linha() {
        List<Linha> l = banco.naLoja(jdbc -> jdbc.query("select passo, concluido_em is not null as concluido from onboarding",
                (rs, i) -> new Linha(rs.getString("passo"), rs.getBoolean("concluido"))));
        if (l.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "O assistente de início não se aplica a esta loja");
        return l.get(0);
    }


    private String escrever(Object v) {
        if (v == null) return null;
        try {
            return json.writeValueAsString(v);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Primeiro nome, sem acento nem símbolo, minúsculo (2 a 20 letras/números); se já existir, acrescenta 2, 3... */
    static String loginLivre(String nome, Set<String> existentes) {
        return br.com.agendz.auth.Temporarias.loginLivre(nome, existentes);
    }

    static String senhaTemporaria() {
        return br.com.agendz.auth.Temporarias.senha();
    }
}
