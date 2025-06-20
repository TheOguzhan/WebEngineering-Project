import { WebSocketServer } from 'ws';
import http from 'http';
import fetch from 'node-fetch';

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Spielräume und Spielerverbindungen speichern
const gameRooms = new Map();
const playerConnections = new Map();

wss.on('connection', (ws, req) => {
    console.log('Neue WebSocket-Verbindung');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            await handleMessage(ws, data);
        } catch (error) {
            console.error('Fehler beim Verarbeiten der Nachricht:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Ungültiges Nachrichtenformat' }));
        }
    });

    ws.on('close', () => {
        handleDisconnection(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket-Fehler:', error);
    });
});

async function handleMessage(ws, data) {
    const { type, spiel_uuid, player_name, guess_result, guess_word, row } = data;

    switch (type) {
        case 'join_game':
            await handleJoinGame(ws, spiel_uuid, player_name);
            break;

        case 'guess_made':
            await handleGuessResult(ws, spiel_uuid, guess_result, guess_word, row);
            break;

        case 'game_won':
            await handleGameWon(ws, spiel_uuid, player_name);
            break;

        case 'game_lost':
            await handleGameLost(ws, spiel_uuid, player_name);
            break;

        default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unbekannter Nachrichtentyp' }));
    }
}

async function handleJoinGame(ws, spiel_uuid, player_name) {
    if (!gameRooms.has(spiel_uuid)) {
        gameRooms.set(spiel_uuid, {
            players: [],
            gameState: {
                player1Board: Array(6).fill(null).map(() => Array(5).fill('')),
                player2Board: Array(6).fill(null).map(() => Array(5).fill('')),
                player1Colors: Array(6).fill(null).map(() => Array(5).fill('')),
                player2Colors: Array(6).fill(null).map(() => Array(5).fill('')),
                gameStarted: false,
                gameFinished: false,
                winner: null
            }
        });
    }

    const room = gameRooms.get(spiel_uuid);

    if (room.players.length >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Spielraum ist voll' }));
        return;
    }

    const playerNumber = room.players.length + 1;
    const player = {
        ws: ws,
        name: player_name || `Player ${playerNumber}`,
        playerNumber: playerNumber,
        spiel_uuid: spiel_uuid
    };

    room.players.push(player);
    playerConnections.set(ws, player);

    // Das Wort für dieses Spiel abrufen
    try {
        let url = 'http://localhost:8080/get_word.php?uuid=' + spiel_uuid;
        if (process.env.NODE_ENV === 'production') {
            url = process.env.DEPLOYMENT_URL + 'get_word.php?uuid=' + spiel_uuid;
        }
        const response = await fetch(url);
        const wordData = await response.json();

        ws.send(JSON.stringify({
            type: 'joined_game',
            playerNumber: playerNumber,
            playersCount: room.players.length,
            word: wordData.word,
            gameState: room.gameState
        }));

        // Andere Spieler benachrichtigen
        room.players.forEach(p => {
            if (p.ws !== ws) {
                p.ws.send(JSON.stringify({
                    type: 'player_joined',
                    playerName: player.name,
                    playersCount: room.players.length
                }));
            }
        });

        // Spiel starten, wenn wir 2 Spieler haben
        if (room.players.length === 2) {
            room.gameState.gameStarted = true;
            room.players.forEach(p => {
                p.ws.send(JSON.stringify({
                    type: 'game_started',
                    opponents: room.players.filter(op => op.playerNumber !== p.playerNumber).map(op => ({
                        name: op.name,
                        playerNumber: op.playerNumber
                    }))
                }));
            });
        }

    } catch (error) {
        console.error('Fehler beim Abrufen des Wortes:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Konnte Spielwort nicht abrufen' }));
    }
}

async function handleGuessResult(ws, spiel_uuid, guess_result, guess_word, row) {
    const room = gameRooms.get(spiel_uuid);
    if (!room) return;

    const player = playerConnections.get(ws);
    if (!player || room.gameState.gameFinished) return;

    // Verify last guess equals secretWord before accepting win
    const lastRow = room.gameState[`player${player.playerNumber}Board`].findLast(r => r.some(c => c));
    if (!lastRow || lastRow.join('') !== room.gameState.secretWord) {
        ws.send(JSON.stringify({ type: 'error', message: 'Win verification failed' }));
        return;
    }

    const playerIndex = player.playerNumber - 1;

    // Spielzustand mit dem Rateergebnis aktualisieren
    if (playerIndex === 0) {
        room.gameState.player1Colors[row] = guess_result;
        for (let i = 0; i < 5; i++) {
            room.gameState.player1Board[row][i] = guess_word[i];
        }
    } else {
        room.gameState.player2Colors[row] = guess_result;
        for (let i = 0; i < 5; i++) {
            room.gameState.player2Board[row][i] = guess_word[i];
        }
    }

    // Gegnerbrett-Update an andere Spieler senden
    room.players.forEach(p => {
        if (p.ws !== ws) {
            p.ws.send(JSON.stringify({
                type: 'opponent_guess',
                playerNumber: player.playerNumber,
                playerName: player.name,
                row: row,
                colors: guess_result,
                gameState: room.gameState
            }));
        }
    });
}

async function handleGameWon(ws, spiel_uuid, player_name) {
    const room = gameRooms.get(spiel_uuid);
    if (!room) return;

    const player = playerConnections.get(ws);
    if (!player) return;

    room.gameState.gameFinished = true;
    room.gameState.winner = player.playerNumber;

    // Alle Spieler über das Spielergebnis benachrichtigen
    room.players.forEach(p => {
        p.ws.send(JSON.stringify({
            type: 'game_finished',
            winner: player.playerNumber,
            winnerName: player.name,
            isWinner: p.playerNumber === player.playerNumber
        }));
    });
}

async function handleGameLost(ws, spiel_uuid, player_name) {
    const room = gameRooms.get(spiel_uuid);
    if (!room) return;

    const player = playerConnections.get(ws);
    if (!player) return;

    // Prüfen, ob dies der letzte Spieler war, der verloren hat
    const otherPlayers = room.players.filter(p => p.playerNumber !== player.playerNumber);

    // Andere Spieler benachrichtigen, dass dieser Spieler verloren hat
    otherPlayers.forEach(p => {
        p.ws.send(JSON.stringify({
            type: 'opponent_lost',
            playerNumber: player.playerNumber,
            playerName: player.name
        }));
    });
}

function handleDisconnection(ws) {
    const player = playerConnections.get(ws);
    if (!player) return;

    const room = gameRooms.get(player.spiel_uuid);
    if (!room) return;

    // Spieler aus dem Raum entfernen
    room.players = room.players.filter(p => p.ws !== ws);
    playerConnections.delete(ws);

    // Verbleibende Spieler benachrichtigen
    room.players.forEach(p => {
        p.ws.send(JSON.stringify({
            type: 'player_disconnected',
            playerName: player.name,
            playersCount: room.players.length
        }));
    });

    // Leere Räume aufräumen
    if (room.players.length === 0) {
        gameRooms.delete(player.spiel_uuid);
    }

    console.log(`Spieler ${player.name} von Spiel ${player.spiel_uuid} getrennt`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`WebSocket-Server läuft auf Port ${PORT}`);
});
