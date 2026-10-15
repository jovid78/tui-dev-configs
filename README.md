# dev-configs

Config files for my terminal dev setup: Ghostty, Herdr, hunk, Yazi, Helix, plus a Claude Code mod (prompt-numbers).
No secrets in here.

You can copy the files by hand using the table below, or run `./install.sh`.

## Where each file goes (macOS)

| File in this repo | Copy to |
|---|---|
| `ghostty/config.ghostty` | `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty` |
| `herdr/config.toml` | `~/.config/herdr/config.toml` |
| `hunk/config.toml` | `~/.config/hunk/config.toml` |
| `yazi/keymap.toml` | `~/.config/yazi/keymap.toml` |
| `yazi/yazi.toml` | `~/.config/yazi/yazi.toml` |
| `yazi/theme.toml` | `~/.config/yazi/theme.toml` |
| `helix/config.toml` | `~/.config/helix/config.toml` |
| `helix/languages.toml` | `~/.config/helix/languages.toml` |
| `helix/themes/bluloco_dark.toml` | `~/.config/helix/themes/bluloco_dark.toml` |
| `helix/themes/bluloco_light.toml` | `~/.config/helix/themes/bluloco_light.toml` |
| `claude-mods/prompt-numbers/` | `~/.claude/mods/prompt-numbers/` |
| `bin/hx-ref` | `~/.local/bin/hx-ref` (then `chmod +x ~/.local/bin/hx-ref`) |

Create the destination folders first if they don't exist (`mkdir -p`).

## Manual extras

- Add to `~/.zshrc`: `export EDITOR='hx'`
- Make sure `~/.local/bin` is on your `PATH` (Helix's `Space l` calls `hx-ref`).
- Install the tools themselves: ghostty, herdr, hunk, yazi, helix.
- Helix formatting uses `npx prettier`, so Node must be installed.
- prompt-numbers: make Claude Code load it in every session by adding this to `~/.claude/settings.json`
  (merge into an existing `env` block if there is one):
  ```json
  "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/prompt-numbers" }
  ```
  To try it for one session only: `claude --plugin-dir ~/.claude/mods/prompt-numbers`.

## What these configs do

- **Ghostty**: clears all default shortcuts, keeps only copy/paste/quit; hidden titlebar; option works as alt.
- **Herdr**: sidebar layout/colors, `prefix+a` / `prefix+shift+a` agent switching, `prefix+ctrl+n/p` workspace switching.
- **hunk**: custom Bluloco Dark theme.
- **Yazi**: Shift+Up/Down moves 3 rows; `E` opens the project in Helix; Helix is the text opener.
- **prompt-numbers** (Claude Code mod): numbered colour bars above each prompt (P1), Claude's working part (T1) and its final answer (A1). `/prompt-numbers off|on` toggles it.
- **Helix**: Bluloco theme, relative line numbers, Ctrl+j/k jump 5 lines, Ctrl+y opens Yazi picker, `Space l` copies path:lines + selection (via `hx-ref`), Prettier on save, TS inlay hints (`Space i` toggles).

## Not included on purpose

Herdr logs/sockets/session files and `hunk/state.json` are runtime state.

## Install script

`./install.sh` copies everything to the paths above. Existing files that differ are backed up first as `<name>.bak-<timestamp>`.
