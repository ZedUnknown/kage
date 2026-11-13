# Print a new base64-encoded 32-byte encryption key. Paste it into .env.
$bytes = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $generator.GetBytes($bytes)
    [Convert]::ToBase64String($bytes)
} finally {
    $generator.Dispose()
}

# Keep a clicked terminal window open, but do not block piped output.
if (-not [Console]::IsInputRedirected) {
    $null = Read-Host 'Press Enter to close'
}
