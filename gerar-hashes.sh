#!/usr/bin/env bash
# Gera o objeto EXPECTED_SHA256 para colar no background.js.
# Uso: ./gerar-hashes.sh   (a partir da raiz da extensão, ou de qualquer lugar)
set -euo pipefail

cd "$(dirname "$0")"

if command -v sha256sum >/dev/null 2>&1; then
  hash_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then   # macOS
  hash_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "Erro: sha256sum/shasum não encontrado." >&2
  exit 1
fi

[ -f app.html ] || { echo "Erro: app.html não encontrado." >&2; exit 1; }
[ -d js ]       || { echo "Erro: pasta js/ não encontrada." >&2; exit 1; }

files=("app.html")
while IFS= read -r f; do files+=("$f"); done < <(find js -maxdepth 1 -type f -name '*.js' | LC_ALL=C sort)

echo "{"
last=$(( ${#files[@]} - 1 ))
for i in "${!files[@]}"; do
  f="${files[$i]}"
  sep=","; [ "$i" -eq "$last" ] && sep=""
  printf '  "%s": "%s"%s\n' "$f" "$(hash_file "$f")" "$sep"
done
echo "}"
