# 🌟 Tera Settings Saver v2

Easily manage, save, and load your TERA client settings (UI, keybinds, etc.) for different characters and profiles.

---

## 🚀 Quick Start & Important First Step!

When you first log in with a character, this mod creates a settings file for them (`data/CharacterName-ServerID.json`). Your current in-game settings are **not** automatically saved to this new file.

💡 **After your character loads into the game for the first time with this mod, type `settings save` to store your current setup.**

---

## 🔧 Commands

**Base:** `settings` (or `!settings`)

* `💾 save`

  * Saves your current live in-game settings to this character's file.
* `📂 load <profilename>`

  * Loads `<profilename>.json` from `data/`, overwrites this character's file, and applies settings to your live game.
* `📝 saveas <profilename>`

  * Saves your current live in-game settings to a new `data/<profilename>.json`.
* `🔄 reload`

  * Re-applies settings from this character's file to your live game.
* `🔒 lock`

  * Toggles write-protection on this character's settings file (prevents accidental `save` or `load` overwrites).
* `📊 status`

  * Shows file path, lock status, and if live settings match the character file.

---

## 🧠 How It Works

* The mod tracks your live in-game settings and compares them to your character's saved file.
* It will notify you if they differ.
* **All file changes and applications to your game client are controlled by your commands.**

---

## 📝 Notes

* **📁 File Location:** `YourToolboxFolder/mods/tera-settings-saver/data/`
* **✅ Profile Validity:** Profiles for `load` should be valid JSON with `accountSettings` and/or `userSettings`.
* **🧹 Auto-Sanitized Filenames:** Special characters in names are removed for filenames.

---