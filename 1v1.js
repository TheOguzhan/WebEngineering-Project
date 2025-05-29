const keys = [
    "Q",
    "W",
    "E",
    "R",
    "T",
    "Z",
    "U",
    "I",
    "O",
    "P",
    "Ü",
    "A",
    "S",
    "D",
    "F",
    "G",
    "H",
    "J",
    "K",
    "L",
    "Ö",
    "Ä",
    "Enter",
    "Y",
    "X",
    "C",
    "V",
    "B",
    "N",
    "M",
    "Backspace",
    "ß"
]

// Timer-Variablen
let gameStartTime = null;
let timerInterval = null;
let gameFinished = false;

let currentScore = 0;

let givenInput = "";

let row_id = 0;

let game_won = false;

let game_lost = false;

// WebSocket und Multiplayer-Variablen
let ws = null;
let playerNumber = null;
let currentWord = null;
let opponentName = null;
let gameStarted = false;
let playersCount = 0;

const showMenu = () => {
    document.querySelector('#menu-dialog').showModal();
}

// WebSocket-Verbindung und Handler
const connectWebSocket = () => {
    try {
        ws = new WebSocket('ws://localhost:3000');

        ws.onopen = () => {
            console.log('WebSocket verbunden');
            updateConnectionStatus('connected', 'Verbunden');
            joinGame();
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };

        ws.onclose = () => {
            console.log('WebSocket getrennt');
            updateConnectionStatus('error', 'Verbindung getrennt');
            setTimeout(() => {
                if (!gameFinished) {
                    connectWebSocket();
                }
            }, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket-Fehler:', error);
            updateConnectionStatus('error', 'Verbindungsfehler');
            document.getElementById('connection-error-dialog').showModal();
        };
    } catch (error) {
        console.error('Fehler beim Verbinden des WebSockets:', error);
        updateConnectionStatus('error', 'Verbindungsfehler');
    }
};

const joinGame = () => {
    const spiel_uuid = window.location.search.split("=")[1];
    if (ws && ws.readyState === WebSocket.OPEN && spiel_uuid) {
        ws.send(JSON.stringify({
            type: 'join_game',
            spiel_uuid: spiel_uuid,
            player_name: `Player ${Date.now().toString().slice(-4)}` // Einfacher zufälliger Name
        }));
    }
};

const handleWebSocketMessage = (data) => {
    switch (data.type) {
        case 'joined_game':
            playerNumber = data.playerNumber;
            playersCount = data.playersCount;
            currentWord = data.word;
            updateConnectionStatus('waiting', `Verbunden (${data.playersCount}/2)`);
            updatePlayerCount(data.playersCount);
            console.log('Spiel beigetreten als Spieler', playerNumber, 'Wort:', currentWord);
            break;

        case 'player_joined':
            playersCount = data.playersCount;
            updatePlayerCount(data.playersCount);
            updateConnectionStatus('waiting', `Verbunden (${data.playersCount}/2)`);
            break;

        case 'game_started':
            gameStarted = true;
            updateConnectionStatus('connected', 'Spiel gestartet!');
            if (data.opponents && data.opponents.length > 0) {
                opponentName = data.opponents[0].name;
                document.getElementById('opponent-name').textContent = `Gegner: ${opponentName}`;
            }
            document.getElementById('opponent-board-display').style.display = 'block';
            break;

        case 'opponent_guess':
            updateOpponentBoard(data.row, data.colors);
            break;

        case 'game_finished':
            if (!data.isWinner) {
                // Gegner hat gewonnen
                stopTimer();
                document.removeEventListener('keydown', handleKeydown);
                document.getElementById('opponent-won-text').textContent =
                    `${data.winnerName} hat das Wort erraten und gewonnen!`;
                document.getElementById('opponent-won-dialog').showModal();
            }
            break;

        case 'opponent_lost':
            // Gegner hat verloren, aber wir spielen möglicherweise noch
            break;

        case 'player_disconnected':
            document.getElementById('opponent-disconnected-dialog').showModal();
            break;

        case 'error':
            console.error('WebSocket-Fehler:', data.message);
            updateConnectionStatus('error', 'Fehler: ' + data.message);
            break;
    }
};

const updateConnectionStatus = (status, text) => {
    const statusElement = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');

    statusElement.className = `connection-status ${status}`;
    statusText.textContent = text;
};

const updatePlayerCount = (count) => {
    document.getElementById('player-count').textContent = `Spieler: ${count}/2`;
};

const updateOpponentBoard = (row, colors) => {
    for (let col = 0; col < 5; col++) {
        const cell = document.querySelector(`[data-opponent-row="${row}"][data-opponent-col="${col}"]`);
        if (cell) {
            cell.className = 'opponent-board-display-cell';
            if (colors[col] === 'green') {
                cell.classList.add('correct-cell');
            } else if (colors[col] === 'yellow') {
                cell.classList.add('present-cell');
            } else if (colors[col] === 'gray') {
                cell.classList.add('absent-cell');
            }
        }
    }
};

// Timer-Funktionen
const startTimer = () => {
    if (!gameStartTime && !gameFinished) {
        gameStartTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
    }
}

const updateTimer = () => {
    if (gameStartTime && !gameFinished) {
        const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timerElement = document.getElementById('game-timer');
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

const stopTimer = () => {
    gameFinished = true;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

const getElapsedTime = () => {
    if (gameStartTime) {
        return Math.floor((Date.now() - gameStartTime) / 1000);
    }
    return 0;
}

const calculateScore = (elapsedTimeInSeconds, incorrectGuesses) => {
    if (game_lost) {
        return 0;
    }

    if (incorrectGuesses === 0) { // Beim ersten Versuch gewonnen
        return 5000;
    }

    let baseScore = 4000;
    const timePenalty = Math.floor(elapsedTimeInSeconds / 10) * 50; // 50 Punkte Abzug alle 10 Sekunden
    const guessPenalty = incorrectGuesses * 250; // 250 Punkte Abzug für jede falsche Ratereihe

    let finalScore = baseScore - timePenalty - guessPenalty;

    return Math.max(1, finalScore); // Stelle sicher, dass der Score mindestens 1 ist, wenn gewonnen
}

window.addEventListener('load', async () => {
    updateActiveCells();
    connectWebSocket();

    document.querySelector('.menu-button').addEventListener('click', showMenu);

    document.querySelectorAll("dialog").forEach(dialog => {
        dialog.addEventListener('click', ev => {
            if (ev.target.tagName === "DIALOG") {
                ev.target.close();
            }
        });
    });

    const showScoreboardButton = document.getElementById('show-scoreboard-button');
    if (showScoreboardButton) {
        showScoreboardButton.addEventListener('click', showScoreboard);
    }

    document.querySelector('.share-game-button').addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href);
        alert("Link kopiert!");
    });
});

const updateActiveCells = () => {
    let must_active_cells = document.querySelectorAll(`[data-row="${row_id}"].game-board-row-cell`);
    for (let cell of must_active_cells) {
        cell.classList.add("active-cell");
    }
}

const errorRowCells = () => {
    let error_row = document.querySelectorAll(`[data-row="${row_id}"].game-board-row-cell`);
    for (let cell of error_row) {
        cell.classList.remove("active-cell");
        cell.classList.add("error-cell");
    }
}

const updateKeyboardKey = (key, color) => {
    // Prüfen, ob die Taste bereits eine höhere Prioritätsfarbe hat
    let keyboard_key = document.querySelector(`[data-keyboard-key="${key}"]`);
    if (keyboard_key.classList.contains("keyboard-green-key")) {
        return; // Grün hat höchste Priorität, keine Aktualisierung nötig
    }
    if (keyboard_key.classList.contains("keyboard-yellow-key") && color !== "green") {
        return; // Gelb hat höhere Priorität als Grau, keine Aktualisierung nötig, außer es ist grün
    }
    if (keyboard_key.classList.contains("keyboard-gray-key") && color === "gray") {
        return; // Grau ist niedrigste Priorität, keine Aktualisierung wenn bereits grau
    }
    console.log(key, color, `[data-keyboard-key="${key}"]`);
    keyboard_key.classList.add("keyboard-" + color + "-key");
    if (color === "green") {
        keyboard_key.classList.remove("keyboard-yellow-key");
    }
}

const handleKeydown = (e) => {
    if (keys.includes(e.key.toUpperCase()) || e.key === "Backspace" || e.key === "Enter" || e.key === "ß") {
        updateInput(e.key.toUpperCase());
    }
}

document.addEventListener('keydown', handleKeydown);

const updateCellColor = (cell, color) => {
    cell.classList.remove("active-cell");
    cell.classList.add(color + "-cell");
}

const updateInput = (key) => {
    // Timer beim ersten Input starten
    if (!gameStartTime && !gameFinished && gameStarted) {
        startTimer();
    }

    if (key !== "⌫" && key !== "↵" && key !== "ENTER" && key !== "BACKSPACE") {
        if (key === 'SS') key = 'ß'
        givenInput += key
    }
    if (givenInput.length > 5) {
        givenInput = givenInput.slice(0, 5);
    }
    if (key === "BACKSPACE" || key === "⌫") {
        givenInput = givenInput.slice(0, givenInput.length - 1);
        updateBoard();
        return;
    }

    if (key === "ENTER" || key === "↵") {
        // nur voranschreiten, wenn ein vollständiges 5-Buchstaben-Wort eingegeben wurde und das Spiel gestartet ist
        if (givenInput.length === 5 && gameStarted && currentWord) {
            // Wort lokal gegen das vom Server erhaltene Wort prüfen
            const result = checkWordLocally(givenInput, currentWord);

            // Unser Spielfeld mit dem Ergebnis aktualisieren
            for (let i = 0; i < 5; i++) {
                updateCellColor(document.querySelector(`[data-location="${row_id * 5 + i}"]`), result[i]);
                updateKeyboardKey(givenInput[i], result[i]);
            }

            // Rateergebnis über WebSocket an andere Spieler senden
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'guess_made',
                    spiel_uuid: window.location.search.split("=")[1],
                    guess_result: result,
                    guess_word: givenInput,
                    row: row_id
                }));
            }

            // Prüfen, ob das Spiel gewonnen wurde
            if (result.every(color => color === 'green')) {
                game_won = true;
                stopTimer();
                document.removeEventListener('keydown', handleKeydown);

                const elapsedTime = getElapsedTime();
                currentScore = calculateScore(elapsedTime, row_id);

                const minutes = Math.floor(elapsedTime / 60);
                const seconds = elapsedTime % 60;
                const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                const gameWonDialogText = document.querySelector('#game-won-dialog p');
                gameWonDialogText.innerHTML = `Glückwunsch! Du hast das Wort in ${timeText} erraten.<br>Dein Punktestand: ${currentScore}`;

                const dialogContent = document.querySelector('#game-won-dialog .dialog-content');

                // Container für Spitznamen-Zellen erstellen
                const nicknameContainer = document.createElement('div');
                nicknameContainer.className = 'nickname-input-container';

                const nicknameCells = [];
                for (let i = 0; i < 3; i++) {
                    const cell = document.createElement('input');
                    cell.type = 'text';
                    cell.maxLength = 1;
                    cell.className = 'nickname-cell';
                    cell.id = `nickname-cell-${i}`;
                    cell.addEventListener('input', (e) => {
                        e.target.value = e.target.value.toUpperCase();
                        if (e.target.value && i < 2) {
                            nicknameCells[i + 1].focus();
                        }
                    });
                    cell.addEventListener('keydown', (e) => {
                        if (e.key === 'Backspace' && !e.target.value && i > 0) {
                            nicknameCells[i - 1].focus();
                        }
                    });
                    nicknameContainer.appendChild(cell);
                    nicknameCells.push(cell);
                }

                const saveScoreButton = document.createElement('button');
                saveScoreButton.textContent = 'Punktestand speichern';
                saveScoreButton.classList.add('share-game-button'); // Bestehenden Button-Style wiederverwenden
                saveScoreButton.onclick = () => {
                    const nickname = nicknameCells.map(cell => cell.value).join('');
                    if (nickname.length === 3) {
                        const spiel_uuid = window.location.search.split("=")[1];
                        fetch('save_score.php', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                spiel_uuid: spiel_uuid,
                                score: currentScore,
                                nickname: nickname
                            })
                        })
                            .then(response => response.json())
                            .then(saveData => {
                                if (saveData.success) {
                                    alert('Punktestand gespeichert!');
                                    saveScoreButton.disabled = true;
                                    nicknameCells.forEach(cell => cell.disabled = true);
                                } else {
                                    alert('Fehler beim Speichern: ' + saveData.error);
                                }
                            })
                            .catch(error => {
                                console.error('Error saving score:', error);
                                alert('Ein Fehler ist aufgetreten.');
                            });
                    } else {
                        alert('Bitte gib einen Spitznamen mit 3 Buchstaben ein.');
                    }
                };

                // Vorherigen dynamischen Inhalt löschen und neue Elemente hinzufügen
                const existingNicknameInput = dialogContent.querySelector('#nickname-input');
                if (existingNicknameInput) existingNicknameInput.remove();
                const existingSaveButton = dialogContent.querySelector('button');
                if (existingSaveButton && existingSaveButton.textContent === 'Punktestand speichern') existingSaveButton.remove();

                dialogContent.appendChild(nicknameContainer);
                dialogContent.appendChild(saveScoreButton);

                document.querySelector('#game-won-dialog').showModal();

                // Andere Spieler über WebSocket benachrichtigen
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'game_won',
                        spiel_uuid: window.location.search.split("=")[1],
                        player_name: `Player ${playerNumber}`
                    }));
                }
                return;
            }
            if (row_id === 5) { // Das bedeutet, 6 Versuche wurden gemacht (0 bis 5)
                game_lost = true;
                stopTimer();
                currentScore = 0; // Score ist 0 bei Verlust, keine Berechnung nötig
                document.removeEventListener('keydown', handleKeydown);

                const elapsedTime = getElapsedTime();
                const minutes = Math.floor(elapsedTime / 60);
                const seconds = elapsedTime % 60;
                const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                document.querySelector('#game-lost-dialog p').textContent = `Leider hast du das Wort nicht erraten. Zeit: ${timeText}. Punktestand: ${currentScore}`;

                document.querySelector('#game-lost-dialog').showModal();

                // Andere Spieler über WebSocket benachrichtigen
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'game_lost',
                        spiel_uuid: window.location.search.split("=")[1],
                        player_name: `Player ${playerNumber}`
                    }));
                }
                return;
            }
            row_id++;
            givenInput = "";
            updateActiveCells();
        }
        return;
    }
    writeToBoard();
}

// Funktion zum lokalen Prüfen des Wortes ohne Server-Aufruf
const checkWordLocally = (guess, targetWord) => {
    const result = [];
    const guessChars = guess.split('');
    const targetChars = targetWord.split('');
    const targetCharCount = {};

    // Zeichen im Zielwort zählen
    for (let char of targetChars) {
        targetCharCount[char] = (targetCharCount[char] || 0) + 1;
    }

    // Erster Durchgang: korrekte Positionen markieren (grün)
    for (let i = 0; i < 5; i++) {
        if (guessChars[i] === targetChars[i]) {
            result[i] = 'green';
            targetCharCount[guessChars[i]]--;
        } else {
            result[i] = null; // Wird im zweiten Durchgang bestimmt
        }
    }

    // Zweiter Durchgang: gelb und grau markieren
    for (let i = 0; i < 5; i++) {
        if (result[i] === null) { // Nicht bereits als grün markiert
            if (targetCharCount[guessChars[i]] > 0) {
                result[i] = 'yellow';
                targetCharCount[guessChars[i]]--;
            } else {
                result[i] = 'gray';
            }
        }
    }

    return result;
};

const writeToBoard = () => {
    const cell = document.querySelector(`[data-location="${row_id * 5 + givenInput.length - 1}"]`);
    cell.textContent = givenInput.charAt(givenInput.length - 1);
}

const updateBoard = () => {
    const board = document.querySelector(`[data-row="${row_id}"].game-board-row`);
    for (let child of board.children) {
        child.textContent = givenInput.charAt(child.dataset.column);
    }
}

const showScoreboard = () => {
    const spiel_uuid = window.location.search.split("=")[1];
    if (!spiel_uuid) {
        alert("Keine Spiel-ID gefunden, um die Bestenliste anzuzeigen.");
        return;
    }

    fetch(`get_scoreboard.php?spiel_uuid=${spiel_uuid}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert("Fehler beim Laden der Bestenliste: " + data.error);
                return;
            }

            const scoreboardListDiv = document.getElementById('scoreboard-list');
            scoreboardListDiv.innerHTML = ''; // Vorherige Punkte löschen

            if (data.length === 0) {
                scoreboardListDiv.textContent = 'Noch keine Einträge für dieses Spiel.';
            } else {
                const ol = document.createElement('ol');
                data.forEach(entry => {
                    const li = document.createElement('li');
                    const date = new Date(entry.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

                    // Spans für bessere Styling-Kontrolle verwenden
                    const nicknameSpan = document.createElement('span');
                    nicknameSpan.className = 'nickname';
                    nicknameSpan.textContent = entry.nickname;

                    const scoreSpan = document.createElement('span');
                    scoreSpan.className = 'score';
                    scoreSpan.textContent = `: ${entry.score} Punkte `;

                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'date';
                    dateSpan.textContent = `(am ${date})`;

                    li.appendChild(nicknameSpan);
                    li.appendChild(scoreSpan);
                    li.appendChild(dateSpan);

                    if (entry.is_user) {
                        li.style.fontWeight = 'bold';
                        // Benutzerpunktestand ist bereits grün durch .score Klasse, aber fett beibehalten für Betonung
                        nicknameSpan.style.color = 'var(--wordle-yellow)'; // Benutzer-Spitznamen anders hervorheben
                    }
                    ol.appendChild(li);
                });
                scoreboardListDiv.appendChild(ol);
            }
            document.getElementById('scoreboard-dialog').showModal();
        })
        .catch(error => {
            console.error('Error fetching scoreboard:', error);
            alert('Ein Fehler ist beim Abrufen der Bestenliste aufgetreten.');
        });
}
