# win-credential-helper.ps1
#
# Windows Credential Manager primitive helper for D-MODEL / W1-MODEL-E
# credential acceptance. Mirrors the keyring "windows-native" backend used in
# src-tauri/src/models.rs: Generic credentials, target name "{account}.{service}",
# and a UTF-16LE password blob (no BOM, no trailing NUL).
#
# Operations (first positional argument):
#   write <target> <secret>   store a Generic credential
#   read  <target>            print the stored secret to stdout
#   delete <target>           remove the Generic credential
#
# Every report is emitted on stdout as a single line; failures go to stderr
# with a non-zero exit code. This file is intentionally ASCII-only so it is
# safe under Windows PowerShell 5.1 + GBK consoles.

param(
  [Parameter(Mandatory = $true)][string]$Op,
  [Parameter(Mandatory = $true)][string]$Target,
  [string]$Secret
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class VinkeyCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWriteW(ref CREDENTIAL cred, uint flags);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr cred);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDeleteW(string target, uint type, uint flags);

  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);

  public const uint TYPE_GENERIC = 1;
  public const uint PERSIST_ENTERPRISE = 3;
}
'@

function New-CredentialTarget([string]$value) {
  return [Runtime.InteropServices.Marshal]::StringToHGlobalUni($value)
}

function Write-Cred([string]$t, [string]$s) {
  $bytes = [System.Text.Encoding]::Unicode.GetBytes($s)
  $targetPtr = [IntPtr]::Zero
  $userPtr = [IntPtr]::Zero
  $blobPtr = [IntPtr]::Zero
  try {
    $targetPtr = New-CredentialTarget $t
    $userPtr = New-CredentialTarget $t
    $blobPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blobPtr, $bytes.Length)

    $cred = New-Object VinkeyCred+CREDENTIAL
    $cred.Type = [VinkeyCred]::TYPE_GENERIC
    $cred.TargetName = $targetPtr
    $cred.UserName = $userPtr
    $cred.CredentialBlobSize = [uint32]$bytes.Length
    $cred.CredentialBlob = $blobPtr
    $cred.Persist = [VinkeyCred]::PERSIST_ENTERPRISE

    if (-not [VinkeyCred]::CredWriteW([ref]$cred, 0)) {
      $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      throw "CredWriteW failed with Win32 error $code"
    }
    Write-Output 'OK'
  } finally {
    if ($targetPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($targetPtr) }
    if ($userPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($userPtr) }
    if ($blobPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($blobPtr) }
  }
}

function Read-Cred([string]$t) {
  $ptr = [IntPtr]::Zero
  if (-not [VinkeyCred]::CredReadW($t, [VinkeyCred]::TYPE_GENERIC, 0, [ref]$ptr)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "CredReadW failed with Win32 error $code"
  }
  try {
    $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][VinkeyCred+CREDENTIAL])
    $bytes = New-Object byte[] $cred.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
    Write-Output ([System.Text.Encoding]::Unicode.GetString($bytes))
  } finally {
    if ($ptr -ne [IntPtr]::Zero) { [VinkeyCred]::CredFree($ptr) }
  }
}

function Delete-Cred([string]$t) {
  if (-not [VinkeyCred]::CredDeleteW($t, [VinkeyCred]::TYPE_GENERIC, 0)) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "CredDeleteW failed with Win32 error $code"
  }
  Write-Output 'OK'
}

try {
  if ($Op -eq 'write') {
    if ([string]::IsNullOrEmpty($Secret)) { throw 'write requires a non-empty secret' }
    Write-Cred $Target $Secret
  } elseif ($Op -eq 'read') {
    Read-Cred $Target
  } elseif ($Op -eq 'delete') {
    Delete-Cred $Target
  } else {
    throw "unknown operation: $Op"
  }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
