package br.com.agendz.interno;

import br.com.agendz.erro.ErroDeNegocio;
import java.util.ArrayList;
import java.util.Hashtable;
import java.util.List;
import javax.naming.Context;
import javax.naming.NameNotFoundException;
import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** TXT pelo resolvedor do sistema (ou o servidor em `agendz.dns.servidor`, ex.: dns://1.1.1.1), com limite de tempo curto. */
@Component
public class ConsultaTxtDns implements ConsultaTxt {

    private final String servidor;

    public ConsultaTxtDns(@Value("${agendz.dns.servidor:}") String servidor) {
        this.servidor = servidor == null ? "" : servidor.trim();
    }

    @Override
    public List<String> txt(String nome) {
        Hashtable<String, String> env = new Hashtable<>();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.dns.DnsContextFactory");
        env.put("com.sun.jndi.dns.timeout.initial", "3000");
        env.put("com.sun.jndi.dns.timeout.retries", "2");
        if (!servidor.isEmpty()) env.put(Context.PROVIDER_URL, servidor);
        DirContext ctx = null;
        try {
            ctx = new InitialDirContext(env);
            Attributes a = ctx.getAttributes(nome, new String[] {"TXT"});
            Attribute t = a.get("TXT");
            List<String> saida = new ArrayList<>();
            if (t == null) return saida;
            for (int i = 0; i < t.size() && i < 20; i++) {
                // O JDK devolve cada registro como "parte1" "parte2": junta as partes sem as aspas.
                String bruto = String.valueOf(t.get(i));
                saida.add(bruto.replace("\" \"", "").replace("\"", "").trim());
            }
            return saida;
        } catch (NameNotFoundException e) {
            return List.of();
        } catch (NamingException e) {
            throw new ErroDeNegocio(HttpStatus.SERVICE_UNAVAILABLE, "Não foi possível consultar o DNS agora. Tente de novo em instantes.");
        } finally {
            if (ctx != null) {
                try {
                    ctx.close();
                } catch (NamingException ignorado) {
                    // nada a fazer
                }
            }
        }
    }
}
