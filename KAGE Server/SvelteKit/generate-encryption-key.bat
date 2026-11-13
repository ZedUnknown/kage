@echo off
rem Print a new base64-encoded 32-byte encryption key. Paste it into .env.
rem Wait for Enter when opened in a terminal; skip the wait for piped output.
powershell.exe -NoProfile -Command "$bytes = New-Object byte[] 32; $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create(); try { $generator.GetBytes($bytes); [Convert]::ToBase64String($bytes) } finally { $generator.Dispose() }; if (-not [Console]::IsInputRedirected) { [Console]::Write('Press Enter to close: '); $null = [Console]::ReadLine() }"
exit /b %errorlevel%
