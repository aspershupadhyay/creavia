#!/bin/sh
# Install Creavia on macOS or Linux with one command:
#
#   curl -fsSL https://raw.githubusercontent.com/aspershupadhyay/creavia/main/install.sh | sh
#
# It downloads the newest release from GitHub and installs it the usual way for this computer:
#   macOS                   → /Applications/Creavia.app (or ~/Applications if /Applications isn't writable)
#   Ubuntu, Debian, Mint    → the .deb, with apt (asks for your password)
#   Fedora, RHEL, openSUSE  → the .rpm, with dnf / zypper (asks for your password)
#   anything else           → the AppImage in ~/.local/bin, with a menu entry
# Afterwards Creavia updates itself from inside the app.
#
# Options (environment variables):
#   CREAVIA_FORMAT=appimage|deb|rpm   choose the Linux package instead of the automatic pick
#   CREAVIA_VERSION=v0.1.1            a specific release instead of the newest
#   CREAVIA_NO_LAUNCH=1               don't open Creavia when done
set -eu

REPO="aspershupadhyay/creavia"
say()  { printf '  \033[38;5;214m✦\033[0m %s\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

printf '\n  \033[1mCreavia\033[0m · create, publish and grow\n\n'

have curl || fail "curl is needed (it comes with macOS; on Linux: install curl)."
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t creavia)
trap 'rm -rf "$TMP"' EXIT INT TERM

# root runs commands directly; everyone else through sudo
if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif have sudo; then SUDO="sudo"; else SUDO=""; fi

# the release's file list
if [ -n "${CREAVIA_VERSION:-}" ]; then API="https://api.github.com/repos/$REPO/releases/tags/$CREAVIA_VERSION"
else API="https://api.github.com/repos/$REPO/releases/latest"; fi
say "Finding the newest Creavia…"
curl -fsSL -H "Accept: application/vnd.github+json" "$API" -o "$TMP/release.json" \
  || fail "Couldn't reach GitHub. Check your internet connection and try again."
TAG=$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$TMP/release.json" | head -n 1)
URLS=$(sed -n 's/.*"browser_download_url": *"\([^"]*\)".*/\1/p' "$TMP/release.json")
pick() { printf '%s\n' "$URLS" | grep -E "$1" | grep -v '\.sig$' | head -n 1; }
fetch() { # url → file, with a progress bar
  say "Downloading $(basename "$1")…"
  curl -fL --progress-bar "$1" -o "$2" || fail "The download stopped. Run the command again: it starts over cleanly."
}

OS=$(uname -s)
ARCH=$(uname -m)

if [ "$OS" = "Darwin" ]; then
  case "$ARCH" in
    arm64) URL=$(pick '_aarch64\.dmg$') ;;
    x86_64) URL=$(pick '_x64\.dmg$') ;;
    *) fail "This Mac ($ARCH) isn't supported." ;;
  esac
  [ -n "$URL" ] || fail "No Mac installer in release $TAG."
  fetch "$URL" "$TMP/Creavia.dmg"
  say "Installing…"
  MNT="$TMP/mount"; mkdir -p "$MNT"
  hdiutil attach -nobrowse -quiet -mountpoint "$MNT" "$TMP/Creavia.dmg" || fail "Couldn't open the disk image."
  # /Applications is writable for Mac admins; otherwise your own Applications folder (no password needed either way)
  SUDO=""
  DEST="/Applications"
  if [ ! -w "$DEST" ]; then DEST="$HOME/Applications"; mkdir -p "$DEST"; fi
  osascript -e 'quit app "Creavia"' >/dev/null 2>&1 || true
  $SUDO rm -rf "$DEST/Creavia.app"
  $SUDO cp -R "$MNT/Creavia.app" "$DEST/" || { hdiutil detach -quiet "$MNT" || true; fail "Couldn't copy Creavia into $DEST."; }
  hdiutil detach -quiet "$MNT" || true
  # downloaded by curl, so macOS hasn't quarantined it; clear it anyway in case, so there's no "damaged" warning
  $SUDO xattr -dr com.apple.quarantine "$DEST/Creavia.app" 2>/dev/null || true
  ok "Creavia $TAG is in $DEST"
  [ -n "${CREAVIA_NO_LAUNCH:-}" ] || open "$DEST/Creavia.app"

elif [ "$OS" = "Linux" ]; then
  [ "$ARCH" = "x86_64" ] || fail "Creavia for Linux is built for x86_64 (Intel/AMD) so far; this computer is $ARCH."
  FORMAT="${CREAVIA_FORMAT:-}"
  if [ -z "$FORMAT" ]; then
    if have apt-get && have dpkg; then FORMAT=deb
    elif have dnf || have zypper || have yum; then FORMAT=rpm
    else FORMAT=appimage; fi
    # the packages need root; without it, the AppImage (it lives in your home folder)
    if [ "$FORMAT" != appimage ] && [ "$(id -u)" -ne 0 ] && [ -z "$SUDO" ]; then FORMAT=appimage; fi
  fi
  case "$FORMAT" in
    deb)
      URL=$(pick '_amd64\.deb$'); [ -n "$URL" ] || fail "No .deb in release $TAG."
      fetch "$URL" "$TMP/creavia.deb"
      say "Installing with apt (it may ask for your password)…"
      $SUDO apt-get install -y "$TMP/creavia.deb" || fail "apt couldn't install it. Try: CREAVIA_FORMAT=appimage"
      BIN=$(command -v creavia || echo /usr/bin/creavia)
      ok "Creavia $TAG installed. It's in your apps menu."
      ;;
    rpm)
      URL=$(pick '\.x86_64\.rpm$'); [ -n "$URL" ] || fail "No .rpm in release $TAG."
      fetch "$URL" "$TMP/creavia.rpm"
      say "Installing (it may ask for your password)…"
      if have dnf; then $SUDO dnf install -y "$TMP/creavia.rpm"
      elif have zypper; then $SUDO zypper --non-interactive install --allow-unsigned-rpm "$TMP/creavia.rpm"
      else $SUDO yum install -y "$TMP/creavia.rpm"; fi || fail "Couldn't install the .rpm. Try: CREAVIA_FORMAT=appimage"
      BIN=$(command -v creavia || echo /usr/bin/creavia)
      ok "Creavia $TAG installed. It's in your apps menu."
      ;;
    appimage)
      URL=$(pick '_amd64\.AppImage$'); [ -n "$URL" ] || fail "No AppImage in release $TAG."
      DIR="$HOME/.local/bin"; mkdir -p "$DIR"
      fetch "$URL" "$TMP/Creavia.AppImage"
      chmod +x "$TMP/Creavia.AppImage"
      mv -f "$TMP/Creavia.AppImage" "$DIR/Creavia.AppImage"
      BIN="$DIR/Creavia.AppImage"
      # a menu entry and an icon (taken from the AppImage itself)
      APPS="$HOME/.local/share/applications"; ICONS="$HOME/.local/share/icons/hicolor/128x128/apps"
      mkdir -p "$APPS" "$ICONS"
      ( cd "$TMP" && "$BIN" --appimage-extract '*.png' >/dev/null 2>&1 ) || true
      ICON=$(find "$TMP/squashfs-root" -maxdepth 1 -name '*.png' 2>/dev/null | head -n 1)
      [ -n "$ICON" ] && cp "$ICON" "$ICONS/creavia.png"
      cat > "$APPS/creavia.desktop" <<EOF
[Desktop Entry]
Name=Creavia
Comment=Create, publish and grow
Exec=$BIN %U
Icon=creavia
Terminal=false
Type=Application
Categories=AudioVideo;Graphics;Office;
EOF
      ok "Creavia $TAG is in $DIR, and in your apps menu."
      # AppImages need FUSE 2; say how to get it rather than guess the package manager
      if ! ls /usr/lib*/libfuse.so.2 /usr/lib/*/libfuse.so.2 /lib/*/libfuse.so.2 >/dev/null 2>&1; then
        say "If Creavia doesn't open, install FUSE once: sudo apt install libfuse2t64  (Ubuntu 22.04: libfuse2; Fedora: fuse-libs)"
      fi
      ;;
    *) fail "CREAVIA_FORMAT must be appimage, deb or rpm." ;;
  esac
  if [ -z "${CREAVIA_NO_LAUNCH:-}" ] && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
    nohup "$BIN" >/dev/null 2>&1 &
  fi

else
  fail "This script is for macOS and Linux. On Windows, run in PowerShell:  irm https://raw.githubusercontent.com/$REPO/main/install.ps1 | iex"
fi

printf '\n  Vee will walk you through the first minute. Updates come by themselves, from inside the app. ✦\n\n'
