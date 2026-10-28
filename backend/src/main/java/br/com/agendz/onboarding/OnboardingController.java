package br.com.agendz.onboarding;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.escala.EscalaService.Dia;
import br.com.agendz.escala.EscalaService.Escala;
import br.com.agendz.escala.EscalaService.Faixa;
import br.com.agendz.onboarding.CatalogoDeServicos.Catalogo;
import br.com.agendz.onboarding.CatalogoDeServicos.Item;
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


    public record Estado(String tipo, String passo, boolean concluido, List<Item> servicos, List<String> jaCadastrados, Escala expedienteSugerido, Escala expediente) {
    }

    public record ItemEscolhido(
            @NotBlank @Size(max = 40) @Pattern(regexp = "^[a-z0-9-]{1,40}$", message = "chave inválida") String chave,
            @DecimalMin("0") @DecimalMax("100000") BigDecimal preco,
            @Min(1) @Max(14400) Integer duracaoMin) {
    }

    public record Servicos(@NotNull @Size(max = 40) List<@Valid @NotNull ItemEscolhido> itens) {
    }

    public record Resultado(int criados, int jaExistiam) {
    }

    public record NovaPessoa(@NotBlank @Size(max = 80) String nome, Boolean atende) {
    }

    public record Equipe(@NotNull @Size(max = 10) List<@Valid @NotNull NovaPessoa> pessoas) {
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

    public OnboardingController(LojaJdbc banco, CatalogoDeServicos catalogos, PasswordEncoder encoder, ObjectMapper json, EscalaService escalas) {
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
        return new Estado(loja.tipo(), l.passo(), l.concluido(), c.servicos(), ja, c.expediente(), EscalaService.temFaixa(atual) ? EscalaService.paraJson(atual) : null);
    }

    @PostMapping("/api/onboarding/servicos")
    public Resultado servicos(@Valid @RequestBody Servicos corpo) {
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
        int[] contagem = new int[2];
        banco.naLoja(jdbc -> {
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
                jdbc.update("insert into servico (loja_id, codigo, nome, categoria, preco, duracao_min, intervalo_min, multi_dia, ativo, precos, duracoes) "
                                + "values (?::uuid, (select (coalesce(max(case when codigo ~ '^[0-9]{1,9}$' then codigo::int end), 0) + 1)::text from servico), "
                                + "?, nullif(?, ''), ?, ?, ?, ?, true, cast(? as jsonb), cast(? as jsonb))",
                        loja.id().toString(), s.nome(), s.categoria() == null ? "" : s.categoria(), preco.setScale(2, RoundingMode.HALF_UP), duracao, s.intervaloMin(), s.multiDia(),
                        escrever(s.precos()), escrever(s.duracoes()));
                contagem[0]++;
            }
            jdbc.update("update onboarding set passo = 'equipe', atualizado_em = now() where concluido_em is null and passo in ('senha', 'servicos')");
            return null;
        });
        return new Resultado(contagem[0], contagem[1]);
    }

    @PostMapping("/api/onboarding/equipe")
    public ResponseEntity<EquipeCriada> equipe(@Valid @RequestBody Equipe corpo) {
        Loja loja = LojaContext.exigir();
        linha(); // 404 se a loja não tem o assistente
        List<PessoaCriada> criadas = banco.naLoja(jdbc -> {
            Set<String> logins = new HashSet<>(jdbc.queryForList("select identificador from usuario", String.class));
            List<PessoaCriada> saida = new ArrayList<>();
            for (NovaPessoa p : corpo.pessoas()) {
                String nome = Texto.limpar(p.nome());
                if (nome.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o nome");
                String login = loginLivre(nome, logins);
                logins.add(login);
                String senha = senhaTemporaria();
                boolean atende = p.atende() == null || p.atende();
                jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, atende, deve_trocar_senha) values (?::uuid, ?, ?, 'profissional', ?, ?, true)",
                        loja.id().toString(), login, nome, encoder.encode(senha), atende);
                saida.add(new PessoaCriada(nome, login, senha, atende));
            }
            jdbc.update("update onboarding set passo = 'expediente', atualizado_em = now() where concluido_em is null and passo in ('senha', 'servicos', 'equipe')");
            return saida;
        });
        // A resposta traz senhas: nada de cache no navegador nem em proxy.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new EquipeCriada(criadas));
    }

    @PostMapping("/api/onboarding/expediente")
    public Resultado expediente(@Valid @RequestBody Expediente corpo) {
        Loja loja = LojaContext.exigir();
        linha(); // 404 se a loja não tem o assistente
        Map<Integer, List<Faixa>> semana = corpo.semana() == null ? null : EscalaService.validar(new Escala(corpo.semana()));
        boolean grava = semana != null && EscalaService.temFaixa(semana);
        banco.naLoja((jdbc) -> {
            if (grava) escalas.gravar(jdbc, loja.id(), null, semana);
            jdbc.update("update onboarding set passo = 'pronto', atualizado_em = now() where concluido_em is null and passo <> 'pronto'");
            return null;
        });
        return new Resultado(grava ? 1 : 0, 0);
    }

    @PostMapping("/api/onboarding/concluir")
    public Estado concluir() {
        Loja loja = LojaContext.exigir();
        linha();
        banco.naLoja(jdbc -> jdbc.update("update onboarding set passo = 'pronto', concluido_em = coalesce(concluido_em, now()), atualizado_em = now()"));
        return new Estado(loja.tipo(), "pronto", true, List.of(), List.of(), null, null);
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
