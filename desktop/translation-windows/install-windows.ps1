param(
    [string]$SourceDirectory = $PSScriptRoot,
    [switch]$NoLaunch,
    [switch]$NoShortcuts
)
$ErrorActionPreference = 'Stop'
$stage = $null
$previous = $null
$installed = $false
function Remove-InstallerFolder([string]$Folder) {
    if (-not $Folder -or -not (Test-Path -LiteralPath $Folder)) { return }
    $resolved = [System.IO.Path]::GetFullPath($Folder)
    if ([System.IO.Path]::GetDirectoryName($resolved) -ne $installParent -or
        [System.IO.Path]::GetFileName($resolved) -notmatch '^\.Ponte-Traducao-(install|previous)-[a-f0-9]{32}$') {
        throw 'Pasta temporária de instalação inválida.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
try {
    if (-not $env:LOCALAPPDATA) { throw 'Não foi possível localizar a pasta de aplicativos deste usuário.' }
    $installParent = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')
    if (-not [System.IO.Path]::IsPathRooted($installParent) -or $installParent -eq [System.IO.Path]::GetPathRoot($installParent).TrimEnd('\')) {
        throw 'A pasta de aplicativos deste usuário é inválida.'
    }
    $target = [System.IO.Path]::GetFullPath((Join-Path $installParent 'Ponte-Traducao'))
    if ([System.IO.Path]::GetDirectoryName($target) -ne $installParent) { throw 'Destino de instalação inválido.' }
    $source = (Resolve-Path -LiteralPath $SourceDirectory).Path
    $sourcePackage = Join-Path $source 'resources\app\package.json'
    if (-not (Test-Path -LiteralPath (Join-Path $source 'Ponte-Traducao.exe')) -or -not (Test-Path -LiteralPath $sourcePackage)) {
        throw 'Extraia o ZIP inteiro antes de executar Instalar.cmd. Não separe os arquivos do pacote.'
    }
    $package = Get-Content -Raw -LiteralPath $sourcePackage | ConvertFrom-Json
    if ($package.name -ne 'ponte-traducao' -or $package.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Este pacote do Ponte não é válido.' }
    # Never replace a running presenter: stopping it could interrupt the congregation.
    if (Get-Process -Name 'Ponte-Traducao' -ErrorAction SilentlyContinue) {
        throw 'Feche o aplicativo Ponte - Tradução antes de instalar. Se houver um culto em andamento, aguarde a tradução terminar e execute Instalar.cmd novamente.'
    }
    if (Test-Path -LiteralPath $target) {
        $existingPackage = Join-Path $target 'resources\app\package.json'
        if (-not (Test-Path -LiteralPath $existingPackage)) { throw 'A pasta de destino não contém uma instalação reconhecida do Ponte. Nenhum arquivo foi substituído.' }
        $existing = Get-Content -Raw -LiteralPath $existingPackage | ConvertFrom-Json
        if ($existing.name -ne 'ponte-traducao') { throw 'A pasta de destino pertence a outro aplicativo. Nenhum arquivo foi substituído.' }
        if ([version]$existing.version -gt [version]$package.version) { throw 'Uma versão mais recente já está instalada. Use o pacote mais recente.' }
    }
    if ($source -ne $target) {
        New-Item -ItemType Directory -Path $installParent -Force | Out-Null
        $stage = Join-Path $installParent ('.Ponte-Traducao-install-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stage | Out-Null
        foreach ($item in Get-ChildItem -LiteralPath $source -Force) {
            Copy-Item -LiteralPath $item.FullName -Destination $stage -Recurse -Force
        }
        if (Test-Path -LiteralPath $target) {
            $previous = Join-Path $installParent ('.Ponte-Traducao-previous-' + [guid]::NewGuid().ToString('N'))
            Move-Item -LiteralPath $target -Destination $previous
        }
        try {
            Move-Item -LiteralPath $stage -Destination $target
            $stage = $null
        } catch {
            if ($previous -and -not (Test-Path -LiteralPath $target)) {
                Move-Item -LiteralPath $previous -Destination $target
                $previous = $null
            }
            throw
        }
    }
    $installed = $true
    # App data lives outside this directory. Reusing the same target also reuses the shortcuts.
    if (-not $NoShortcuts) {
        $shortcutShell = New-Object -ComObject WScript.Shell
        foreach ($folder in @([Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('Programs'))) {
            if (-not $folder) { continue }
            New-Item -ItemType Directory -Path $folder -Force | Out-Null
            $shortcut = $shortcutShell.CreateShortcut((Join-Path $folder 'Ponte - Tradução.lnk'))
            $shortcut.TargetPath = Join-Path $target 'Ponte-Traducao.exe'
            $shortcut.WorkingDirectory = $target
            $shortcut.IconLocation = (Join-Path $target 'resources\app\app-icon.ico') + ',0'
            $shortcut.Description = 'Ponte - Tradução ao vivo'
            $shortcut.Save()
        }
    }
    Remove-InstallerFolder $previous
    Write-Host ('Ponte - Tradução ' + $package.version + ' instalado em ' + $target)
    Write-Host 'As próximas instalações substituirão esta versão no mesmo local.'
    if (-not $NoLaunch) { Start-Process -FilePath (Join-Path $target 'Ponte-Traducao.exe') -WorkingDirectory $target -WindowStyle Normal }
} catch {
    Write-Host ('Não foi possível concluir a instalação: ' + $_.Exception.Message) -ForegroundColor Red
    if ($installed) { Write-Host ('O aplicativo já foi copiado. Você pode abri-lo em ' + $target) }
    exit 1
} finally {
    Remove-InstallerFolder $stage
}
