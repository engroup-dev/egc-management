#!/usr/bin/env bash
# The desktop app's downloads on engroup.ly (https://engroup.ly/downloads/).
# Install on the EGC server as /usr/local/bin/egc-desktop-release (root,
# 755). It runs as the deploy user, through the forced SSH command of the
# key GitHub Actions uses (readme.md, "Releases and downloads"):
#
#   tar -czf - <files> | ssh deploy@host "upload 1.1.18"   # stored, not live
#   ssh deploy@host "promote 1.1.18"                        # goes live
#   ssh deploy@host "status"
#
# upload   stores one release under desktop/<version>/. Nothing visitors
#          see changes.
# promote  makes a stored release the live one: writes desktop/latest.json
#          (what the website's /download page reads) and points the
#          Windows auto-update feed (desktop/win32/x64/) at it. Promoting
#          an older stored version is the rollback.
#
# DOWNLOADS_ROOT overrides /www/wwwroot/downloads, for testing.
set -euo pipefail
umask 022

ROOT="${DOWNLOADS_ROOT:-/www/wwwroot/downloads}"
DESKTOP="$ROOT/desktop"
FEED="$DESKTOP/win32/x64"
KEEP=4                                     # stored versions kept (the live one always is)
MAX_UPLOAD_BYTES=$((1024 * 1024 * 1024))   # 1 GiB per release

die() { echo "!! $*" >&2; exit 1; }
usage() {
  echo "usage: egc-desktop-release upload <version> < release.tar.gz" >&2
  echo "       egc-desktop-release promote <version>" >&2
  echo "       egc-desktop-release status" >&2
  exit 2
}

# Under the forced command the whole request arrives as one argument
# ("$SSH_ORIGINAL_COMMAND"), so split it here.
read -r -a ARGS <<< "${*:-}"
CMD="${ARGS[0]:-}"
VERSION="${ARGS[1]:-}"
case "$CMD" in
  upload|promote) [[ ${#ARGS[@]} -eq 2 ]] || usage ;;
  status) [[ ${#ARGS[@]} -eq 1 ]] || usage ;;
  *) usage ;;
esac
if [[ "$CMD" != status && ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  die "bad version: $VERSION"
fi

# The files of one release, by the names CI gives them (.github/workflows/
# build.yml). The nupkg and RELEASES keep Squirrel's names: RELEASES lists
# the nupkg by name.
exe_name()  { echo "EGC-Setup-$1.exe"; }
dmg_name()  { echo "EGC-$1-arm64.dmg"; }
nupkg_re()  { echo "^[A-Za-z0-9_.-]+-${1//./\\.}-full\\.nupkg$"; }

live_version() { cat "$DESKTOP/.live" 2>/dev/null || true; }

# Checks a release folder holds exactly the four expected regular files.
check_release() {
  local dir="$1" v="$2" n nupkg=""
  local count=0
  for n in "$dir"/* "$dir"/.[!.]*; do
    [[ -e "$n" || -L "$n" ]] || continue
    count=$((count + 1))
    [[ -f "$n" && ! -L "$n" ]] || die "not a regular file: ${n##*/}"
    case "${n##*/}" in
      "$(exe_name "$v")"|"$(dmg_name "$v")"|RELEASES) ;;
      *) [[ "${n##*/}" =~ $(nupkg_re "$v") ]] || die "unexpected file: ${n##*/}"
         nupkg="${n##*/}" ;;
    esac
  done
  [[ $count -eq 4 ]] || die "expected 4 files (exe, dmg, nupkg, RELEASES), got $count"
  [[ -f "$dir/$(exe_name "$v")" ]] || die "missing $(exe_name "$v")"
  [[ -f "$dir/$(dmg_name "$v")" ]] || die "missing $(dmg_name "$v")"
  [[ -n "$nupkg" ]] || die "missing the -full.nupkg"
  [[ -f "$dir/RELEASES" ]] || die "missing RELEASES"
  # RELEASES must be the one line Squirrel wrote for this nupkg:
  # "<SHA1> <nupkg> <size>". Squirrel starts it with a UTF-8 byte-order
  # mark and ends it without a newline.
  local releases
  releases="$(sed '1s/^\xEF\xBB\xBF//' "$dir/RELEASES" | tr -d '\r')"
  [[ "$releases" != *$'\n'* ]] || die "RELEASES should have one line"
  [[ "$releases" =~ ^[0-9A-Fa-f]{40}\ ([^ ]+)\ [0-9]+$ && "${BASH_REMATCH[1]}" == "$nupkg" ]] \
    || die "RELEASES doesn't list $nupkg"
  echo "$nupkg"
}

# Keeps the newest $KEEP stored versions, plus the live one and $1.
prune() {
  local keep_also="$1" live v
  live="$(live_version)"
  mapfile -t versions < <(find "$DESKTOP" -mindepth 1 -maxdepth 1 -type d \
    -regextype posix-extended -regex '.*/[0-9]+\.[0-9]+\.[0-9]+' -printf '%f\n' | sort -V)
  local excess=$(( ${#versions[@]} - KEEP ))
  for v in "${versions[@]}"; do
    (( excess > 0 )) || break
    [[ "$v" == "$live" || "$v" == "$keep_also" ]] && continue
    echo "==> Removing old version $v"
    rm -rf "${DESKTOP:?}/$v"
    excess=$((excess - 1))
  done
}

mkdir -p "$DESKTOP"
exec 9>"$DESKTOP/.lock"
flock -w 600 9 || die "another release command is still running"

case "$CMD" in
  status)
    echo "live: $(live_version || true)"
    echo "stored:"
    find "$DESKTOP" -mindepth 1 -maxdepth 1 -type d \
      -regextype posix-extended -regex '.*/[0-9]+\.[0-9]+\.[0-9]+' -printf '  %f\n' | sort -V
    ;;

  upload)
    [[ "$(live_version)" != "$VERSION" ]] || die "$VERSION is live; it can't be replaced"
    TMP="$(mktemp -d "$DESKTOP/.upload.XXXXXX")"
    trap 'rm -rf "$TMP"' EXIT

    echo "==> Receiving $VERSION"
    head -c $((MAX_UPLOAD_BYTES + 1)) > "$TMP/release.tar.gz"
    (( $(wc -c < "$TMP/release.tar.gz") <= MAX_UPLOAD_BYTES )) || die "upload is over 1 GiB"

    # Only plain files at the top level, before anything is unpacked.
    while IFS= read -r line; do
      [[ "$line" == -* ]] || die "archive holds something other than plain files"
    done < <(tar -tvzf "$TMP/release.tar.gz")
    while IFS= read -r name; do
      [[ "$name" =~ ^[A-Za-z0-9_.-]+$ && "$name" != .* ]] || die "bad name in archive: $name"
    done < <(tar -tzf "$TMP/release.tar.gz")

    mkdir "$TMP/files"
    tar -xzf "$TMP/release.tar.gz" -C "$TMP/files" --no-same-owner --no-same-permissions
    nupkg="$(check_release "$TMP/files" "$VERSION")"
    chmod 644 "$TMP/files"/*
    chmod 755 "$TMP/files"

    rm -rf "${DESKTOP:?}/$VERSION"
    mv "$TMP/files" "$DESKTOP/$VERSION"
    echo "==> Stored $VERSION ($nupkg); not live until promoted"
    prune "$VERSION"
    ;;

  promote)
    DIR="$DESKTOP/$VERSION"
    [[ -d "$DIR" ]] || die "$VERSION hasn't been uploaded"
    nupkg="$(check_release "$DIR" "$VERSION")"
    exe="$(exe_name "$VERSION")"
    dmg="$(dmg_name "$VERSION")"

    # Windows auto-update (Squirrel.Windows, update-electron-app's static
    # storage): RELEASES and the package it lists, side by side. A hard
    # link, not a copy, so the package isn't stored twice.
    echo "==> Pointing the Windows update feed at $VERSION"
    mkdir -p "$FEED"
    ln -f "$DIR/$nupkg" "$FEED/$nupkg"
    cp "$DIR/RELEASES" "$FEED/.RELEASES.tmp"
    mv -f "$FEED/.RELEASES.tmp" "$FEED/RELEASES"
    find "$FEED" -maxdepth 1 -type f -name '*-full.nupkg' ! -name "$nupkg" -delete

    # What the website shows. Paths are relative to https://engroup.ly/downloads/.
    echo "==> Writing latest.json"
    size() { wc -c < "$1" | tr -d ' '; }
    sha() { sha256sum "$1" | cut -d' ' -f1; }
    cat > "$DESKTOP/.latest.json.tmp" <<EOF
{
  "version": "$VERSION",
  "released_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "windows": { "path": "desktop/$VERSION/$exe", "size": $(size "$DIR/$exe"), "sha256": "$(sha "$DIR/$exe")" },
  "mac_arm64": { "path": "desktop/$VERSION/$dmg", "size": $(size "$DIR/$dmg"), "sha256": "$(sha "$DIR/$dmg")" }
}
EOF
    chmod 644 "$DESKTOP/.latest.json.tmp"
    mv -f "$DESKTOP/.latest.json.tmp" "$DESKTOP/latest.json"
    echo "$VERSION" > "$DESKTOP/.live.tmp" && mv -f "$DESKTOP/.live.tmp" "$DESKTOP/.live"

    echo "==> $VERSION is live"
    prune "$VERSION"
    ;;
esac
