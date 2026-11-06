<#
.SYNOPSIS
    Automatiza a inserção de novos itens no Backlog (docs/BACKLOG-FUTURO.md)
    e na Sessão (../SESSAO.md), com melhoria técnica de texto e baixo consumo de tokens.

.EXAMPLE
    ./tools/adicionar-ao-backlog.ps1 -JsonPath "tools/novos-itens.json"
#>
param(
    [string]$JsonPath,
    [string]$Titulo,
    [string]$Contexto,
    [string[]]$Comportamento,
    [string]$Arquivos,
    [string]$Validacao
)

$scriptMjs = Join-Path $PSScriptRoot "adicionar-ao-backlog.mjs"

if ($JsonPath) {
    node $scriptMjs --json $JsonPath
} elseif ($Titulo) {
    $tempFile = Join-Path $PSScriptRoot "temp-item-$([System.Guid]::NewGuid().ToString('N')).json"
    $obj = @(
        @{
            titulo = $Titulo
            contexto = $Contexto
            comportamento = $Comportamento
            arquivos = $Arquivos
            validacao = $Validacao
        }
    )
    $obj | ConvertTo-Json -Depth 5 | Set-Content $tempFile -Encoding UTF8
    try {
        node $scriptMjs --json $tempFile
    } finally {
        Remove-Item $tempFile -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "Uso: ./tools/adicionar-ao-backlog.ps1 -JsonPath 'caminho.json'"
    Write-Host " ou: ./tools/adicionar-ao-backlog.ps1 -Titulo '...' -Contexto '...'"
}
