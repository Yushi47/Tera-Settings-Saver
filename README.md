# Tera Settings Saver  
Preserve and transfer TERA client settings/keybinds between characters and servers.  

---

## Commands  
**Primary Command**  
`!settings <lock|filename>`  
- `!settings lock` - Toggle protection against accidental overwrites  
- `!settings filename` - Load settings from a saved profile (e.g., `!settings MyChar-1001`)  

**Old Commands No Longer Supported**  
`!keybinds`, `!key`, and `!set` have been removed. Use `!settings` instead.  

---

## How It Works  
1. Automatically creates a settings file when you enter the game.  
2. Saved files: `TeraToolbox/mods/tera-settings-saver/data/[Character]-[ServerID].json`  
   Example: `MyWarrior-1001.json`  

---

## Troubleshooting  
- **Relog required** after loading new settings.  
- **"Settings file not found"**:  
  - Check exact filename (case-sensitive) in the `data` folder.  
  - Filenames auto-sanitize special characters.  
- **Settings reset?** The mod will auto-correct and notify you in chat.  

---
