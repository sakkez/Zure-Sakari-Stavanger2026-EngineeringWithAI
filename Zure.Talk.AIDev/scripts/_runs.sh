# Shared helpers, sourced by the other scripts.

# Opening a .sh from PowerShell runs it in an interactive git-bash.exe, where node
# is aliased to "winpty node.exe" and fails with "stdout is not a tty". Drop aliases.
unalias -a 2>/dev/null || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Print "run skills effort port" per entry of a runs.yaml (flat format only).
read_runs() {
  awk '
    /^[[:space:]]*-[[:space:]]*run:/ { if (r) print r, s, e, p; r=$NF; s="raw"; e="medium"; p=""; next }
    /^[[:space:]]*skills:/ { s=$NF; next }
    /^[[:space:]]*effort:/ { e=$NF; next }
    /^[[:space:]]*port:/   { p=$NF; next }
    END { if (r) print r, s, e, p }
  ' "$1"
}

# A run name as a herdr agent/workspace name: "a/b" -> "a-b"; "ecc-med" stays as it is.
run_slug() { echo "${1//\//-}"; }

talk_dir() {
  local d="$ROOT/talks/${1:?talk name required}"
  [[ -d "$d" ]] || { echo "no such talk: $d" >&2; exit 1; }
  echo "$d"
}
