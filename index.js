const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_SERVER_ID = '0000';

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sanitizeName(name) {
    return (name || 'unknown-character').replace(/[^\w\-]/g, '');
}

function loadSettings(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(e) {
        return { lock: false };
    }
}

function saveSettings(filePath, data) {
    if (!filePath) return;
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
    } catch(e) {
        // Suppress write errors during transitions
    }
}

class KeybindSaver {
    constructor(dispatch) {
        const command = dispatch.command;
        let settingsPath = null;
        let isConnected = false;
        let packetHandlerActive = true;

        function handleCommand(arg) {
            if (!settingsPath) {
                command.message("Enter game first!");
                return;
            }

            if (!arg) {
                command.message("Usage: !settings [lock|filename]");
                return;
            }

            if (arg.toLowerCase() === "lock") {
                const data = loadSettings(settingsPath);
                data.lock = typeof data.lock === 'boolean' ? !data.lock : false;
                saveSettings(settingsPath, data);
                command.message(`Settings lock ${data.lock ? "ON" : "OFF"}`);
                return;
            }

            const targetFile = path.join(DATA_DIR, `${sanitizeName(arg)}.json`);
            if (!fs.existsSync(targetFile)) {
                command.message("Settings file not found!");
                return;
            }

            const newData = loadSettings(targetFile);
            if (newData?.accountSettings && newData?.userSettings) {
                saveSettings(settingsPath, newData);
                command.message("Settings loaded! Relog to apply.");
            }
        }

        command.add(['settings', '!settings'], handleCommand);

        function handleIncoming(key, payload, fake) {
            if (!packetHandlerActive || fake || !Buffer.isBuffer(payload)) return true;
            
            try {
                const hex = payload.toString('hex');
                const currentData = loadSettings(settingsPath);

                if (currentData[key]?.payload) {
                    const expected = Buffer.from(
                        `${currentData[key].length}${currentData[key].opcode}${currentData[key].payload}`,
                        'hex'
                    );

                    if (!expected.equals(payload)) {
                        setTimeout(() => {
                            if (packetHandlerActive) {
                                dispatch.toClient(expected);
                                command.message("Settings mismatch corrected");
                            }
                        }, 100);
                        return false;
                    }
                } else {
                    currentData[key] = {
                        length: hex.slice(0, 4),
                        opcode: hex.slice(4, 8),
                        payload: hex.slice(8)
                    };
                    saveSettings(settingsPath, currentData);
                }
                return true;
            } catch(e) {
                return true;
            }
        }

        // Packet handlers
        dispatch.hook('S_LOAD_CLIENT_ACCOUNT_SETTING', 'raw', (code, payload, _, fake) => 
            handleIncoming('accountSettings', payload, fake));
        
        dispatch.hook('S_LOAD_CLIENT_USER_SETTING', 'raw', (code, payload, _, fake) => 
            handleIncoming('userSettings', payload, fake));

        // Save handlers
        const createSaveHandler = (key) => (code, payload, _, fake) => {
            if (!fake && isConnected && settingsPath && payload) {
                const data = loadSettings(settingsPath);
                if (!data.lock) {
                    const hex = payload.toString('hex');
                    data[key] = {
                        length: hex.slice(0, 4),
                        opcode: hex.slice(4, 8),
                        payload: hex.slice(8)
                    };
                    saveSettings(settingsPath, data);
                }
            }
        };

        dispatch.hook('C_SAVE_CLIENT_ACCOUNT_SETTING', 'raw', createSaveHandler('accountSettings'));
        dispatch.hook('C_SAVE_CLIENT_USER_SETTING', 'raw', createSaveHandler('userSettings'));

        // Connection management
        dispatch.hook('C_RETURN_TO_LOBBY', 'raw', () => {
            packetHandlerActive = false;
            isConnected = false;
            settingsPath = null;
        });

        dispatch.hook('S_RETURN_TO_LOBBY', 'raw', () => {
            isConnected = false;
            packetHandlerActive = false;
        });

        dispatch.hook('C_LOAD_TOPO_FIN', 'raw', () => {
            isConnected = true;
            packetHandlerActive = true;
        });

        // Game entry handler
        dispatch.game.on('enter_game', () => {
            try {
                const charName = sanitizeName(dispatch.game.me?.name);
                const serverId = dispatch.game.serverId?.toString() || DEFAULT_SERVER_ID;
                settingsPath = path.join(DATA_DIR, `${charName}-${serverId}.json`);

                if (!fs.existsSync(settingsPath)) {
                    saveSettings(settingsPath, {
                        lock: false,
                        accountSettings: null,
                        userSettings: null
                    });
                }

                setTimeout(() => {
                    packetHandlerActive = true;
                }, 1500);
            } catch(e) {
                // Suppress initialization errors
            }
        });
    }
}

module.exports = KeybindSaver;
