# Pendente do Marcelo (o Claude atualiza este arquivo; apague o item quando fizer)

## Criar as lojas e os donos de produção (quando disser que pode)
Só rode isto **depois** que o login real do site estiver no ar (F2 parte 1; o Claude avisa). Na VPS (`vps1` no PowerShell), uma vez por loja; cada senha aparece **uma única vez**, copie na hora e entregue ao dono (por WhatsApp, por exemplo). Cada dono troca a senha no primeiro acesso.
```
cd /opt/agendz
bash provisionar-loja.sh apex "Apex Estética Automotiva" estetica_automotiva davi "Davi"
bash provisionar-loja.sh dalforno "Barbearia Dalforno" barbearia alan "Alan"
bash provisionar-loja.sh offbox "Offbox Barbearia" barbearia kiko "Kiko"
```
- Esqueceu de copiar uma senha? `bash provisionar-loja.sh <slug> "<Nome>" <tipo> <login> "<Dono>" --redefinir` gera outra.
- O script já grava a logo de cada loja (`logos/<slug>.txt`) e cria o assistente de início pendente.
- Se preferir outro login que não `davi`, `alan` ou `kiko`, troque no comando.

## Feito em 27/10 (pelo Marcelo)
- `DEPLOY_API=true`, pacote `agendz-api` público, `provisionar-loja.sh` das três lojas e `SITE_REAL=true` criados. Falta conferir o login real nos três endereços e entregar as senhas temporárias aos donos (cada um escolhe usuário e senha no primeiro acesso, v80).

## Falta o Marcelo
- Criar o repositório privado `lemarcelo/agendz-admin` (vazio, sem README) para receber o painel (`docs/PROMPT-PAINEL-ADMIN.md`); o ambiente do Claude não consegue criar repositórios.

## Depois do deploy dos clientes reais (F2 parte 2, 27/10)
- **Guarde uma cópia de `CIFRA_CHAVE` e `CIFRA_PEPPER`** (arquivo `/opt/agendz/.env` na VPS) num gerenciador de senhas, **fora** da VPS e **fora** do backup do banco no R2. Sem a chave, o backup do banco não abre CPF, telefone nem nascimento. Veja só as duas linhas, no terminal da VPS: `grep '^CIFRA_' /opt/agendz/.env` (não cole no chat). Não troque depois de cadastrar clientes.
- O primeiro deploy depois desta versão gera as duas chaves sozinho (`preparar-api.sh`) e aplica a migração V10. Ela só roda sem clientes cadastrados (hoje não há nenhum no site real).
