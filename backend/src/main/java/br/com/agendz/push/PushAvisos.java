package br.com.agendz.push;

import br.com.agendz.seguranca.Permissoes;
import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Empurra aos aparelhos os avisos novos do painel (v130), de poucos em poucos segundos: pedido, remarcação e cancelamento pelo link, e horário fixo que não coube.
 * Quem recebe é quem vê o aviso na tela (mesma regra de `AvisosPainel.listar`): dono, administrador e recepção veem todos; o profissional, só os dele.
 * O aviso é reservado no banco antes de enviar (`push_em`), então uma segunda instância ou uma nova rodada nunca repete a mesma mensagem. O envio de rede acontece
 * fora da transação. Aviso com mais de 15 minutos não é empurrado (já não é novidade).
 */
@Component
public class PushAvisos {

    private static final Logger LOG = LoggerFactory.getLogger(PushAvisos.class);
    static final int MINUTOS_DE_VALIDADE = 15;
    static final int FALHAS_PARA_APAGAR = 20;

    private record Aviso(UUID id, UUID profissionalId, String tipo, String texto) {
    }

    private record Destino(Inscricoes.Alvo alvo, String papel) {
    }

    private record Lote(String lojaNome, List<Aviso> avisos, List<Destino> destinos) {
    }

    private final JdbcTemplate dono;
    private final LojaJdbc banco;
    private final PushConfig config;
    private final EntregaPush entrega;
    private final ObjectMapper json;
    private final boolean ativa;

    public PushAvisos(JdbcTemplate dono, LojaJdbc banco, PushConfig config, EntregaPush entrega, ObjectMapper json, @Value("${agendz.push.ativa:true}") boolean ativa) {
        this.dono = dono;
        this.banco = banco;
        this.config = config;
        this.entrega = entrega;
        this.json = json;
        this.ativa = ativa;
    }

    @Scheduled(fixedDelayString = "${agendz.push.intervalo-ms:10000}", initialDelayString = "${agendz.push.atraso-ms:20000}")
    public void rodar() {
        if (!ativa || !config.ligado()) return;
        try {
            executar();
        } catch (RuntimeException e) {
            LOG.warn("Envio de avisos falhou: {}", e.getMessage()); // nunca derruba o agendador; tenta de novo na próxima rodada
        }
    }

    /** Uma rodada em todas as lojas. Devolve quantas mensagens foram entregues ao serviço de push. */
    public int executar() {
        if (!config.ligado()) return 0;
        int entregues = 0;
        for (Map<String, Object> loja : dono.queryForList("select id, nome from loja")) {
            UUID id = (UUID) loja.get("id");
            try {
                entregues += daLoja(id, (String) loja.get("nome"));
            } catch (RuntimeException e) {
                LOG.warn("Envio de avisos falhou na loja {}: {}", id, e.getMessage()); // uma loja com problema não trava as outras
            }
        }
        return entregues;
    }

    private int daLoja(UUID lojaId, String lojaNome) {
        Lote lote = banco.naLoja(lojaId, jdbc -> reservar(jdbc, lojaNome));
        if (lote == null || lote.avisos().isEmpty()) return 0;
        Set<UUID> mortas = new HashSet<>();
        Set<UUID> boas = new HashSet<>();
        Set<UUID> ruins = new HashSet<>();
        int entregues = 0;
        for (Aviso a : lote.avisos()) {
            String mensagem;
            try {
                mensagem = json.writeValueAsString(Map.of("titulo", lote.lojaNome(), "texto", a.texto(), "url", "/", "tag", a.id().toString(), "tipo", a.tipo()));
            } catch (JsonProcessingException e) {
                continue;
            }
            for (Destino d : lote.destinos()) {
                if (!veAviso(d, a)) continue;
                Enviador.Resultado r = entrega.enviar(d.alvo(), mensagem);
                if (r == Enviador.Resultado.ENTREGUE) {
                    entregues++;
                    boas.add(d.alvo().id());
                } else if (r == Enviador.Resultado.INSCRICAO_MORTA) {
                    mortas.add(d.alvo().id());
                } else {
                    ruins.add(d.alvo().id());
                }
            }
        }
        banco.naLoja(lojaId, jdbc -> {
            for (UUID id : mortas) jdbc.update("delete from push_inscricao where id = ?", id);
            for (UUID id : boas) jdbc.update("update push_inscricao set ultimo_envio = now(), falhas = 0 where id = ?", id);
            for (UUID id : ruins) {
                if (!boas.contains(id)) jdbc.update("update push_inscricao set falhas = falhas + 1 where id = ?", id);
            }
            jdbc.update("delete from push_inscricao where falhas >= ?", FALHAS_PARA_APAGAR);
            return null;
        });
        return entregues;
    }

    /** Mesma regra de {@code AvisosPainel.listar}: quem vê tudo recebe tudo; o profissional recebe só o dele. */
    static boolean veAviso(Destino d, Aviso a) {
        if (Permissoes.veTudo(d.papel())) return true;
        return a.profissionalId() != null && a.profissionalId().equals(d.alvo().usuarioId());
    }

    private Lote reservar(JdbcTemplate jdbc, String lojaNome) {
        Integer subs = jdbc.queryForObject("select count(*) from push_inscricao", Integer.class);
        if (subs == null || subs == 0) return null;
        List<Aviso> avisos = new ArrayList<>(jdbc.query("update aviso_painel set push_em = now() where push_em is null and criado_em > now() - make_interval(mins => ?) returning id, profissional_id, tipo, texto, criado_em",
                (rs, i) -> new Aviso(rs.getObject("id", UUID.class), rs.getObject("profissional_id", UUID.class), rs.getString("tipo"), rs.getString("texto")), MINUTOS_DE_VALIDADE));
        if (avisos.isEmpty()) return new Lote(lojaNome, avisos, List.of());
        List<Destino> destinos = jdbc.query("select s.id, s.usuario_id, s.endpoint, s.p256dh, s.auth, u.papel from push_inscricao s join usuario u on u.id = s.usuario_id and u.loja_id = s.loja_id where u.ativo order by s.criado_em, s.id",
                (rs, i) -> new Destino(new Inscricoes.Alvo(rs.getObject("id", UUID.class), rs.getObject("usuario_id", UUID.class), rs.getString("endpoint"), rs.getString("p256dh"), rs.getString("auth")), rs.getString("papel")));
        return new Lote(lojaNome, avisos, destinos);
    }
}
