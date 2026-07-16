[CmdletBinding()]
param(
  [string]$ApiUrl = 'http://localhost:4000',
  [string]$WebUrl = 'http://localhost:3000',
  [string]$AdminIdentifier = 'admin@isi.edu.bo',
  [string]$AdminPassword = $env:DEMO_ADMIN_PASSWORD
)

$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousLocation = Get-Location
$script:checks = 0
$script:authSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$script:loggedIn = $false

if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
  $AdminPassword = 'password123'
}

function Assert-Step {
  param(
    [Parameter(Mandatory)] [string]$Label,
    [Parameter(Mandatory)] [scriptblock]$Action
  )

  try {
    & $Action | Out-Null
    $script:checks++
    Write-Host "[OK] $Label" -ForegroundColor Green
  }
  catch {
    Write-Host "[ERROR] $Label" -ForegroundColor Red
    Write-Host "        $($_.Exception.Message)" -ForegroundColor DarkRed
    throw
  }
}

function Assert-ContainerHealthy {
  param([Parameter(Mandatory)] [string]$Service)

  $containerId = (& docker compose ps -q $Service).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $containerId) {
    throw "El servicio '$Service' no tiene un contenedor en ejecución."
  }

  $state = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId).Trim()
  if ($LASTEXITCODE -ne 0 -or $state -notin @('healthy', 'running')) {
    throw "El servicio '$Service' está en estado '$state'."
  }
}

function Get-PublicJson {
  param([Parameter(Mandatory)] [string]$Path)
  Invoke-RestMethod -Uri "$ApiUrl/api$Path" -TimeoutSec 15
}

function Assert-Page {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Text
  )

  $response = Invoke-WebRequest -Uri "$WebUrl$Path" -TimeoutSec 20
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch [regex]::Escape($Text)) {
    throw "La página '$Path' no devolvió el contenido esperado: '$Text'."
  }
}

try {
  Set-Location $projectRoot

  foreach ($service in @('db', 'api', 'web')) {
    Assert-Step "Contenedor $service saludable" { Assert-ContainerHealthy $service }
  }

  Assert-Step 'API y PostgreSQL responden' {
    $health = Get-PublicJson '/health'
    if ($health.status -ne 'ok' -or $health.database -ne 'up') { throw 'Healthcheck incompleto.' }
  }

  $catalogChecks = @(
    @{ Label = 'Comunidades cargadas'; Path = '/communities'; Collection = 'self' },
    @{ Label = 'Proyectos cargados'; Path = '/projects?limit=1'; Collection = 'items' },
    @{ Label = 'Artículos cargados'; Path = '/articles?limit=1'; Collection = 'items' },
    @{ Label = 'Eventos cargados'; Path = '/events?limit=1'; Collection = 'items' },
    @{ Label = 'Noticias cargadas'; Path = '/news?limit=1'; Collection = 'items' },
    @{ Label = 'Tags del foro cargados'; Path = '/forum/tags'; Collection = 'self' }
  )

  foreach ($check in $catalogChecks) {
    Assert-Step $check.Label {
      $result = Get-PublicJson $check.Path
      $collection = if ($check.Collection -eq 'self') { @($result) } else { @($result.items) }
      if ($collection.Count -lt 1) { throw "No hay datos demo en $($check.Path)." }
    }
  }

  $pageChecks = @(
    @{ Path = '/'; Text = 'Ingeniería de Sistemas Informáticos' },
    @{ Path = '/comunidades'; Text = 'Sociedad Científica' },
    @{ Path = '/proyectos'; Text = 'Proyectos' },
    @{ Path = '/articulos'; Text = 'Artículos científicos' },
    @{ Path = '/eventos'; Text = 'Eventos' },
    @{ Path = '/noticias'; Text = 'Noticias' },
    @{ Path = '/foro'; Text = 'Foro' },
    @{ Path = '/login'; Text = 'Iniciar sesión' }
  )

  foreach ($check in $pageChecks) {
    Assert-Step "Página $($check.Path) renderizada" { Assert-Page $check.Path $check.Text }
  }

  $script:login = $null
  Assert-Step 'Inicio de sesión administrativo' {
    $script:login = Invoke-RestMethod `
      -Method Post `
      -Uri "$ApiUrl/api/auth/login" `
      -Headers @{ Origin = $WebUrl } `
      -WebSession $script:authSession `
      -ContentType 'application/json' `
      -Body (@{ identifier = $AdminIdentifier; password = $AdminPassword } | ConvertTo-Json) `
      -TimeoutSec 20
    if (-not $script:login.accessToken) { throw 'La API no devolvió access token.' }
    $script:loggedIn = $true
  }

  $authHeaders = @{ Authorization = "Bearer $($script:login.accessToken)"; Origin = $WebUrl }
  Assert-Step 'Identidad y rol ADMIN verificados' {
    $me = Invoke-RestMethod -Uri "$ApiUrl/api/auth/me" -Headers $authHeaders -TimeoutSec 15
    if ('ADMIN' -notin @($me.roles)) { throw 'La cuenta indicada no tiene rol ADMIN.' }
  }
  Assert-Step 'Panel administrativo disponible' {
    $dashboard = Invoke-RestMethod -Uri "$ApiUrl/api/admin/dashboard" -Headers $authHeaders -TimeoutSec 15
    if ($null -eq $dashboard.counts.users) { throw 'El dashboard no devolvió sus métricas.' }
  }
  Assert-Step 'Gestión colaborativa de proyectos disponible' {
    $manageable = @(Invoke-RestMethod -Uri "$ApiUrl/api/projects/manage/mine" -Headers $authHeaders -TimeoutSec 15)
    if ($manageable.Count -lt 1) { throw 'La cuenta ADMIN no recibió proyectos gestionables.' }
    if ($null -eq $manageable[0].version) { throw 'Los proyectos no exponen la versión de concurrencia.' }
  }
  Assert-Step 'Bitácora administrativa disponible' {
    $audit = Invoke-RestMethod -Uri "$ApiUrl/api/projects/audit/recent?limit=1" -Headers $authHeaders -TimeoutSec 15
    if ($null -eq $audit.total -or $null -eq $audit.items) { throw 'La bitácora no devolvió su estructura paginada.' }
  }

  Write-Host "`nPreflight completo: $script:checks comprobaciones superadas." -ForegroundColor Cyan
  Write-Host "Portal: $WebUrl | API: $ApiUrl/api/health" -ForegroundColor Cyan
}
finally {
  if ($script:loggedIn) {
    try {
      Invoke-RestMethod `
        -Method Post `
        -Uri "$ApiUrl/api/auth/logout" `
        -Headers @{ Origin = $WebUrl } `
        -WebSession $script:authSession `
        -TimeoutSec 15 | Out-Null
    }
    catch {
      Write-Warning 'No se pudo cerrar la sesión técnica del preflight; revisa /api/auth/sessions.'
    }
  }
  $script:login = $null
  Set-Location $previousLocation
}
