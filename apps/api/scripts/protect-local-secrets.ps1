param(
  [switch]$SaveConnectionBundle,
  [switch]$BackupActiveEnvironment,
  [ValidateSet('production-connections.xml', 'development-connections.xml')]
  [string]$ConnectionBundleName = 'production-connections.xml'
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -and $PSVersionTable.PSEdition -ne 'Desktop') {
  throw 'This credential vault requires Windows DPAPI.'
}
$vaultPath = Join-Path $env:USERPROFILE '.codex\secrets\ponte'
New-Item -ItemType Directory -Force -Path $vaultPath | Out-Null
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.SetAccessRule($rule)
[System.IO.FileSystemAclExtensions]::SetAccessControl([System.IO.DirectoryInfo]::new($vaultPath), $acl)

function Save-ProtectedValue([string]$Value, [string]$Name) {
  $destination = Join-Path $vaultPath $Name
  if (Test-Path -LiteralPath $destination) { throw 'Refusing to overwrite an existing protected secret.' }
  $secure = ConvertTo-SecureString -String $Value -AsPlainText -Force
  $secure | Export-Clixml -LiteralPath $destination
  $verified = [System.Net.NetworkCredential]::new('', (Import-Clixml -LiteralPath $destination)).Password
  if ($verified -cne $Value) { throw 'Protected secret verification failed.' }
}

if ($SaveConnectionBundle) {
  Save-ProtectedValue ([Console]::In.ReadToEnd()) $ConnectionBundleName
  Write-Output 'Connection bundle encrypted with Windows DPAPI and verified.'
} elseif ($BackupActiveEnvironment) {
  $repoPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
  Save-ProtectedValue (Get-Content -LiteralPath (Join-Path $repoPath '.env') -Raw) 'local-environment-before-isolation.xml'
  Write-Output 'Previous local environment encrypted and verified.'
} else {
  $repoPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
  foreach ($name in @('.env.neon-before-deploy', '.env.prod-superuser-credentials.txt')) {
    $sourcePath = Join-Path $repoPath $name
    if (Test-Path -LiteralPath $sourcePath) {
      Save-ProtectedValue (Get-Content -LiteralPath $sourcePath -Raw) ($name + '.xml')
      Remove-Item -LiteralPath $sourcePath
      Write-Output "Archived and verified: $name"
    }
  }
}
