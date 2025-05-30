'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_SERVER_ID = '0000';

// --- Utility Functions ---
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
} catch (e) {
    console.error(`[TeraSettingsSaver] CRITICAL: Failed to create data directory ${DATA_DIR}:`, e.message);
}

function sanitizeName(name) {
    return (name || 'unknown-character').replace(/[^\w\-]/g, '');
}

function loadSettingsFromFile(filePath, mod) {
    const defaultStructure = { lock: false, accountSettings: null, userSettings: null };
    if (!filePath) { 
        if (mod) mod.error(`[TeraSettingsSaver] loadSettingsFromFile: No filePath provided.`);
        return {...defaultStructure}; 
    }
    if (!fs.existsSync(filePath)) {
        if (mod) mod.log(`[TeraSettingsSaver] File not found: ${filePath}. Returning new default structure.`);
        return {...defaultStructure}; 
    }
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        if (!fileContent.trim()) {
            if (mod) mod.log(`[TeraSettingsSaver] File is empty: ${filePath}. Returning new default structure.`);
            return {...defaultStructure}; 
        }
        const data = JSON.parse(fileContent);
        return {
            lock: typeof data.lock === 'boolean' ? data.lock : false,
            accountSettings: data.accountSettings || null,
            userSettings: data.userSettings || null
        };
    } catch (e) {
        if (mod) mod.error(`[TeraSettingsSaver] Error reading/parsing ${filePath}: ${e.message}. Returning new default structure.`);
        return {...defaultStructure}; 
    }
}

function saveSettingsToFile(filePath, data, mod) {
    if (!filePath) {
        if (mod) mod.error(`[TeraSettingsSaver] saveSettingsToFile: No filePath provided.`);
        return false;
    }
    if (typeof data !== 'object' || data === null) { 
        if (mod) mod.error(`[TeraSettingsSaver] saveSettingsToFile: Invalid data provided for ${filePath}.`);
        return false;
    }
    try {
        const dataToSave = {
            lock: typeof data.lock === 'boolean' ? data.lock : false,
            accountSettings: data.accountSettings || null,
            userSettings: data.userSettings || null
        };
        fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 4));
        if (mod) mod.log(`[TeraSettingsSaver] Settings successfully saved to ${filePath}`);
        return true;
    } catch (e) {
        if (mod) mod.error(`[TeraSettingsSaver] Failed to save settings to ${filePath}: ${e.message}`);
        return false;
    }
}
// --- End of Utility Functions ---

module.exports = function TeraSettingsSaver(mod) {
    const command = mod.command;
    let charSettingsFilePath = null;

    let onDiskSettings = loadSettingsFromFile(null, null); 
    let liveClientSettings = { accountSettings: null, userSettings: null };

    let isInGame = false;
    let initialClientSettingsReceived = false;

    function parseRawPacketData(buffer) {
        const hex = buffer.toString('hex');
        return {
            length: hex.slice(0, 4),
            opcode: hex.slice(4, 8),
            payload: hex.slice(8)
        };
    }

    function areSettingsDataEqual(dataA, dataB) {
        if (dataA === null && dataB === null) return true;
        if (dataA === null || dataB === null) return false;
        return JSON.stringify(dataA) === JSON.stringify(dataB);
    }

    // Definition of applySettingsDataToClient
    function applySettingsDataToClient(keyToApply) { 
        if (!onDiskSettings || !onDiskSettings[keyToApply]) {
            command.message(`No ${keyToApply} found in character file to apply.`);
            mod.log(`[TeraSettingsSaver] applyToClient: No data for ${keyToApply} in onDiskSettings.`);
            return;
        }
        try {
            const packetData = onDiskSettings[keyToApply];
            if (!packetData.length || !packetData.opcode || !packetData.payload) {
                 mod.error(`[TeraSettingsSaver] Data for ${keyToApply} in character file is incomplete or corrupt.`);
                 command.message(`Data for ${keyToApply} in character file appears corrupt.`);
                 return;
            }
            const fullPayloadBuffer = Buffer.from(`${packetData.length}${packetData.opcode}${packetData.payload}`, 'hex');
            mod.toClient(fullPayloadBuffer);
            command.message(`${keyToApply} from character file applied to game.`);
        } catch (e) {
            mod.error(`[TeraSettingsSaver] Error applying ${keyToApply} to client: ${e.stack}`);
            command.message(`Error applying ${keyToApply} to client.`);
        }
    }
    
    // Definition of reloadAllSettingsToClient
    function reloadAllSettingsToClient() {
        mod.log(`[TeraSettingsSaver] Reloading all settings from charfile to client.`);
        mod.log(`[TeraSettingsSaver] (reloadAll) typeof applySettingsDataToClient before direct call: ${typeof applySettingsDataToClient}`);
        applySettingsDataToClient('accountSettings'); // Direct call

        mod.log(`[TeraSettingsSaver] (reloadAll) typeof applySettingsDataToClient before setTimeout: ${typeof applySettingsDataToClient}`);
        setTimeout(() => {
            mod.log(`[TeraSettingsSaver] (reloadAll) typeof applySettingsDataToClient INSIDE setTimeout for userSettings: ${typeof applySettingsDataToClient}`);
            if (typeof applySettingsDataToClient === 'function') {
                applySettingsDataToClient('userSettings');
            } else {
                mod.error('[TeraSettingsSaver] CRITICAL (reloadAll): applySettingsDataToClient is NOT a function inside setTimeout for userSettings!');
                command.message("Error: Could not reload user settings (internal error).");
            }
        }, 150); 
    }


    // --- Game Lifecycle Hooks ---
    mod.game.on('enter_game', () => {
        try {
            const charName = sanitizeName(mod.game.me?.name);
            const serverId = mod.game.serverId?.toString() || DEFAULT_SERVER_ID;
            charSettingsFilePath = path.join(DATA_DIR, `${charName}-${serverId}.json`);

            onDiskSettings = loadSettingsFromFile(charSettingsFilePath, mod);
            if (!fs.existsSync(charSettingsFilePath) || !fs.readFileSync(charSettingsFilePath, 'utf8').trim()) {
                if(saveSettingsToFile(charSettingsFilePath, onDiskSettings, mod)) { 
                    mod.log(`[TeraSettingsSaver] Initialized new settings file: ${charSettingsFilePath}`);
                }
            }
            
            liveClientSettings = { accountSettings: null, userSettings: null };
            initialClientSettingsReceived = false;
            isInGame = false; 
            mod.log(`[TeraSettingsSaver] Entered game for ${charName}. Charfile: ${charSettingsFilePath}. Lock: ${onDiskSettings.lock}`);
        } catch (e) {
            mod.error(`[TeraSettingsSaver] CRITICAL Error in on('enter_game'): ${e.stack}`);
            charSettingsFilePath = null;
            onDiskSettings = { lock: true, accountSettings: null, userSettings: null };
            liveClientSettings = { accountSettings: null, userSettings: null };
            isInGame = false;
        }
    });

    mod.hook('C_LOAD_TOPO_FIN', 'raw', () => {
        isInGame = true;
        mod.log("[TeraSettingsSaver] Topology loaded. Client fully in-game.");
    });

    function handleLobbyOrDisconnect() {
        isInGame = false;
        initialClientSettingsReceived = false;
        mod.log("[TeraSettingsSaver] Returned to lobby or disconnected.");
    }
    mod.hook('C_RETURN_TO_LOBBY', 'raw', handleLobbyOrDisconnect);
    mod.hook('S_RETURN_TO_LOBBY', 'raw', handleLobbyOrDisconnect);

    // --- Packet Hooks to Track Client State ---
    function handleIncomingClientSettings(key, packetBuffer, isFake) {
        if (!isInGame || isFake || !Buffer.isBuffer(packetBuffer)) return true;
        if (!charSettingsFilePath || !onDiskSettings) return true;

        try {
            liveClientSettings[key] = parseRawPacketData(packetBuffer);
            mod.log(`[TeraSettingsSaver] Live ${key} updated from server packet.`);

            if (liveClientSettings.accountSettings && liveClientSettings.userSettings && !initialClientSettingsReceived) {
                initialClientSettingsReceived = true;
                mod.log(`[TeraSettingsSaver] Initial live client settings (account & user) received.`);
                if (!areSettingsDataEqual(liveClientSettings.accountSettings, onDiskSettings.accountSettings)) {
                    command.message(`Live accountSettings differ from charfile.`);
                }
                if (!areSettingsDataEqual(liveClientSettings.userSettings, onDiskSettings.userSettings)) {
                    command.message(`Live userSettings differ from charfile.`);
                }
                 if (areSettingsDataEqual(liveClientSettings.accountSettings, onDiskSettings.accountSettings) && areSettingsDataEqual(liveClientSettings.userSettings, onDiskSettings.userSettings)){
                    command.message(`Live settings match charfile.`);
                }
            } else if (initialClientSettingsReceived) { 
                if (!areSettingsDataEqual(liveClientSettings[key], onDiskSettings[key])) {
                     command.message(`Live ${key} now differ from charfile. Consider 'settings save' or 'settings reload'.`);
                }
            }
        } catch (e) {
            mod.error(`[TeraSettingsSaver] Error in handleIncomingClientSettings for ${key}: ${e.stack}`);
        }
        return true;
    }

    mod.hook('S_LOAD_CLIENT_ACCOUNT_SETTING', 'raw', (code, data, i, fake) => handleIncomingClientSettings('accountSettings', data, fake));
    mod.hook('S_LOAD_CLIENT_USER_SETTING', 'raw', (code, data, i, fake) => handleIncomingClientSettings('userSettings', data, fake));

    const handleClientInitiatedSave = (key) => (code, packetBuffer, i, isFake) => {
        if (!isInGame || isFake || !Buffer.isBuffer(packetBuffer)) return true;
        try {
            liveClientSettings[key] = parseRawPacketData(packetBuffer);
            mod.log(`[TeraSettingsSaver] Client trying to save ${key}. Live cache updated.`);
            if (initialClientSettingsReceived && !areSettingsDataEqual(liveClientSettings[key], onDiskSettings[key])) {
                 command.message(`Live ${key} changed by game. Use 'settings save' to persist to charfile.`);
            }
        } catch (e) {
            mod.error(`[TeraSettingsSaver] Error in handleClientInitiatedSave for ${key}: ${e.stack}`);
        }
        return true;
    };
    mod.hook('C_SAVE_CLIENT_ACCOUNT_SETTING', 'raw', handleClientInitiatedSave('accountSettings'));
    mod.hook('C_SAVE_CLIENT_USER_SETTING', 'raw', handleClientInitiatedSave('userSettings'));

    // --- Commands ---
    command.add('settings', (arg1, arg2) => {
        if (!isInGame || !charSettingsFilePath || !onDiskSettings) {
            command.message("Mod not fully initialized or not in game. Please try again shortly.");
            return;
        }
        const action = arg1 ? arg1.toLowerCase() : null;

        switch (action) {
            case 'save':
                if (onDiskSettings.lock) {
                    command.message("Charfile is locked. Cannot save. Unlock with 'settings lock'.");
                    return;
                }
                if (!initialClientSettingsReceived) { // Check if live settings are populated
                    command.message("Live client settings not fully captured yet. Please wait.");
                    return;
                }
                const dataToSaveToCharfile = {
                    lock: onDiskSettings.lock,
                    accountSettings: liveClientSettings.accountSettings,
                    userSettings: liveClientSettings.userSettings
                };
                if (saveSettingsToFile(charSettingsFilePath, dataToSaveToCharfile, mod)) {
                    onDiskSettings = dataToSaveToCharfile; 
                    command.message("Live game settings saved to charfile.");
                } else {
                    command.message("Error saving settings to charfile.");
                }
                break;

            case 'load': 
                if (!arg2) {
                    command.message("Usage: settings load <profilename>");
                    return;
                }
                if (onDiskSettings.lock) {
                    command.message("Charfile is locked. Cannot load profile. Unlock with 'settings lock'.");
                    return;
                }
                const profilePathToLoad = path.join(DATA_DIR, `${sanitizeName(arg2)}.json`);
                if (!fs.existsSync(profilePathToLoad)) {
                     command.message(`Profile "${arg2}" not found.`);
                     return;
                }
                const profileData = loadSettingsFromFile(profilePathToLoad, mod);
                // A profile is "empty/invalid" for loading if BOTH settings parts are null.
                // A profile could intentionally only set account or user settings.
                if (profileData.accountSettings === null && profileData.userSettings === null) {
                    command.message(`Profile "${arg2}" is effectively empty (missing both account & user settings data).`);
                    return;
                }
                const charDataFromProfile = {
                    lock: false, 
                    accountSettings: profileData.accountSettings, // Will be null if profile only had user settings
                    userSettings: profileData.userSettings     // Will be null if profile only had account settings
                };
                if (saveSettingsToFile(charSettingsFilePath, charDataFromProfile, mod)) {
                    onDiskSettings = charDataFromProfile; 
                    command.message(`Profile "${arg2}" applied to charfile.`);
                    reloadAllSettingsToClient(); // And apply to live game
                } else {
                    command.message(`Error applying profile "${arg2}" to charfile.`);
                }
                break;

            case 'saveas': 
                if (!arg2) {
                    command.message("Usage: settings saveas <profilename>");
                    return;
                }
                if (!initialClientSettingsReceived) {
                    command.message("Live client settings not fully captured yet. Cannot save profile.");
                    return;
                }
                const newProfilePath = path.join(DATA_DIR, `${sanitizeName(arg2)}.json`);
                const newProfileData = {
                    lock: false,
                    accountSettings: liveClientSettings.accountSettings,
                    userSettings: liveClientSettings.userSettings
                };
                if (saveSettingsToFile(newProfilePath, newProfileData, mod)) {
                    command.message(`Live game settings saved as new profile: ${arg2}.json`);
                } else {
                    command.message(`Error saving profile ${arg2}.json`);
                }
                break;

            case 'reload':
                command.message("Reloading settings from charfile to live game...");
                reloadAllSettingsToClient();
                break;

            case 'lock':
                onDiskSettings.lock = !onDiskSettings.lock;
                if (saveSettingsToFile(charSettingsFilePath, onDiskSettings, mod)) {
                    command.message(`Charfile lock: ${onDiskSettings.lock ? 'ON' : 'OFF'}.`);
                } else {
                     command.message(`Error updating charfile lock status.`);
                }
                break;

            case 'status':
                command.message(`--- Settings Saver Status ---`);
                command.message(`Charfile: ${charSettingsFilePath || 'N/A (not in game)'}`);
                if (charSettingsFilePath && onDiskSettings) { 
                    command.message(` Charfile Lock: ${onDiskSettings.lock}`);
                    command.message(` Charfile Account Populated: ${onDiskSettings.accountSettings !== null}`);
                    command.message(` Charfile User Populated: ${onDiskSettings.userSettings !== null}`);
                }
                command.message(`Live Account Populated: ${liveClientSettings.accountSettings !== null}`);
                command.message(`Live User Populated: ${liveClientSettings.userSettings !== null}`);
                if (initialClientSettingsReceived && onDiskSettings && isInGame) {
                    command.message(` Live Account == Charfile Account: ${areSettingsDataEqual(liveClientSettings.accountSettings, onDiskSettings.accountSettings)}`);
                    command.message(` Live User == Charfile User: ${areSettingsDataEqual(liveClientSettings.userSettings, onDiskSettings.userSettings)}`);
                } else if (isInGame) {
                     command.message(` Comparison pending full client settings load.`);
                }
                break;

            default:
                command.message("--- TeraSettingsSaver ---");
                command.message(" settings save - Save live game settings to this character's file.");
                command.message(" settings load <profile> - Load <profile>.json to charfile & apply to live game.");
                command.message(" settings saveas <profile> - Save live game settings as <profile>.json.");
                command.message(" settings reload - Apply charfile settings to live game.");
                command.message(" settings lock - Toggle lock on charfile.");
                command.message(" settings status - Show current status and settings comparisons.");
                break;
        }
    });

    this.destructor = () => {
        if (command && command.remove) {
            command.remove('settings');
        }
        mod.log("[TeraSettingsSaver] Module unloaded.");
    };
};