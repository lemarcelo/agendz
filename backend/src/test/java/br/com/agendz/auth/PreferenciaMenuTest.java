package br.com.agendz.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class PreferenciaMenuTest extends BaseApi {
    @Test
    void preferenciaFicaNaContaEIsoladaPorLoja() throws Exception {
        String davi = token(APEX, "davi"), pablo = token(APEX, "pablo"), alan = token(DALFORNO, "alan");
        try {
            mvc.perform(put("/api/usuarios/me/menu").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"recolhido\":true}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.recolhido").value(true));
            mvc.perform(get("/api/usuarios/me/menu").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(token(APEX, "davi"))))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.recolhido").value(true));
            mvc.perform(get("/api/usuarios/me/menu").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.recolhido").value(false));
            mvc.perform(get("/api/usuarios/me/menu").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.recolhido").value(false));
            mvc.perform(get("/api/usuarios/me/menu").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                    .andExpect(status().isForbidden());
            mvc.perform(put("/api/usuarios/me/menu").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                    .contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest());
        } finally {
            mvc.perform(put("/api/usuarios/me/menu").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"recolhido\":false}"));
        }
    }
}
