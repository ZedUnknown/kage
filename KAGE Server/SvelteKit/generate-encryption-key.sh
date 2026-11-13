#!/usr/bin/env sh
set -eu

# Print a new base64-encoded 32-byte encryption key. Paste it into .env.
if command -v openssl >/dev/null 2>&1; then
  openssl rand -base64 32
else
  head -c 32 /dev/urandom | base64
fi

# Keep a clicked terminal window open, but do not block piped output.
if [ -t 0 ]; then
  printf 'Press Enter to close: ' >&2
  IFS= read -r _ || true
fi
