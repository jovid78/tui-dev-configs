#!/bin/sh
# Copies configs to their destinations. Backs up any differing existing file.
set -e
here=$(cd "$(dirname "$0")" && pwd)
ts=$(date +%Y%m%d-%H%M%S)

put() { # src dest
  src="$here/$1"; dest=$2
  mkdir -p "$(dirname "$dest")"
  if [ -e "$dest" ] && ! cmp -s "$src" "$dest"; then
    cp "$dest" "$dest.bak-$ts"
    echo "backed up $dest"
  fi
  cp "$src" "$dest"
  echo "installed $dest"
}

put ghostty/config.ghostty "$HOME/Library/Application Support/com.mitchellh.ghostty/config.ghostty"
put herdr/config.toml      "$HOME/.config/herdr/config.toml"
put hunk/config.toml       "$HOME/.config/hunk/config.toml"
put yazi/keymap.toml       "$HOME/.config/yazi/keymap.toml"
put yazi/yazi.toml         "$HOME/.config/yazi/yazi.toml"
put yazi/theme.toml        "$HOME/.config/yazi/theme.toml"
put helix/config.toml      "$HOME/.config/helix/config.toml"
put helix/languages.toml   "$HOME/.config/helix/languages.toml"
put helix/themes/bluloco_dark.toml  "$HOME/.config/helix/themes/bluloco_dark.toml"
put helix/themes/bluloco_light.toml "$HOME/.config/helix/themes/bluloco_light.toml"
put bin/hx-ref             "$HOME/.local/bin/hx-ref"
chmod +x "$HOME/.local/bin/hx-ref"
for f in .claude-plugin/plugin.json hooks/hooks.json hooks/register.tsx hooks/prompt-numbers.test.tsx types/index.d.ts tsconfig.json; do
  put "claude-mods/prompt-numbers/$f" "$HOME/.claude/mods/prompt-numbers/$f"
done

echo
echo "Done. Manual: add  export EDITOR='hx'  to ~/.zshrc and ensure ~/.local/bin is on PATH,"
echo "and add CLAUDE_CODE_PLUGIN_DIRS to ~/.claude/settings.json (see README)."
