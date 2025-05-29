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

// Timer variables
let gameStartTime = null;
let timerInterval = null;
let gameFinished = false;

let currentScore = 0;

let givenInput = "";

let row_id = 0;

let game_won = false;

let game_lost = false;

let game_uuid = null;

// Safely parse URL parameters
try {
    const urlParams = new URLSearchParams(window.location.search);
    game_uuid = urlParams.get('spiel_uuid');
} catch (error) {
    console.error('Error parsing URL parameters:', error);
    game_uuid = null;
}

// Helper function to safely get URL parameters
function getUrlParameter(name) {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    } catch (error) {
        console.error('Error getting URL parameter:', error);
        return null;
    }
}

// WebSocket and multiplayer variables
let ws = null;
let isMultiplayer = false;
let gameState = null;
let playerNumber = null;
let opponentGuesses = [];
let waitingForOpponent = false;
let gameWord = null;

const showMenu = () => {
    document.querySelector('#menu-dialog').showModal();
}

// WebSocket functions
const connectToGameServer = () => {
    try {
        ws = new WebSocket('ws://localhost:3000');

        ws.onopen = () => {
            console.log('Connected to game server');

            // Check if URL already has a WebSocket game ID
            const urlParams = new URLSearchParams(window.location.search);
            const existingWsGameId = urlParams.get('ws_game_id');

            if (existingWsGameId) {
                // Try to join existing WebSocket game directly
                console.log('Trying to join existing game:', existingWsGameId);
                ws.send(JSON.stringify({
                    type: 'joinGame',
                    gameId: existingWsGameId
                }));
            } else {
                // Create new multiplayer game
                console.log('Creating new multiplayer game');
                ws.send(JSON.stringify({ type: 'createGame' }));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from game server');
            isMultiplayer = false;
            updateMultiplayerUI();
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            isMultiplayer = false;
            updateMultiplayerUI();
        };
    } catch (error) {
        console.error('Failed to connect to game server:', error);
        isMultiplayer = false;
    }
};

const handleWebSocketMessage = (data) => {
    console.log('Received WebSocket message:', data);

    switch (data.type) {
        case 'connected':
            console.log('Connected as player:', data.playerId);
            break;

        case 'gameCreated':
            isMultiplayer = true;
            gameState = data.gameState;
            playerNumber = data.playerNumber;
            waitingForOpponent = true;

            // Update URL with WebSocket game ID (different from PHP UUID)
            const gameUrlParams = new URLSearchParams(window.location.search);
            gameUrlParams.set('ws_game_id', data.gameId);
            const newUrl = window.location.pathname + '?' + gameUrlParams.toString();
            window.history.replaceState({}, '', newUrl);

            updateMultiplayerUI();
            addMultiplayerMessage('Spiel erstellt! Warte auf Gegner...', 'info');
            addMultiplayerMessage('Teile den Link um einen Gegner einzuladen!', 'info');
            break;

        case 'joinedGame':
            isMultiplayer = true;
            gameState = data.gameState;
            playerNumber = data.playerNumber;
            waitingForOpponent = gameState.state === 'waiting';
            updateMultiplayerUI();

            if (waitingForOpponent) {
                addMultiplayerMessage('Warte auf Gegner...', 'info');
            } else {
                addMultiplayerMessage(`Beigetreten als Spieler ${playerNumber}`, 'success');
            }
            break;

        case 'gameState':
            if (data.state === 'ready') {
                waitingForOpponent = false;
                addMultiplayerMessage('Gegner gefunden! Spiel startet in 3 Sekunden...', 'success');
                updateMultiplayerUI();
            } else if (data.state === 'playing') {
                waitingForOpponent = false;
                updateMultiplayerUI();
            }
            break;

        case 'gameStarted':
            waitingForOpponent = false;
            addMultiplayerMessage('Spiel gestartet! Viel Glück!', 'success');
            updateMultiplayerUI();

            // Start timer when multiplayer game begins
            if (!gameStartTime && !gameFinished) {
                startTimer();
            }
            break;

        case 'playerGuess':
            if (data.playerNumber !== playerNumber) {
                handleOpponentGuess(data);
            }
            break;

        case 'guessResult':
            // Handle our own guess result from server
            processGuessResult(data.result, data.guess);

            // The game no longer ends immediately on correct guess
            // We wait for the 'gameEnded' message from server when both players finish
            break;

        case 'gameEnded':
            handleMultiplayerGameEnd(data);
            break;

        case 'error':
            console.error('Game server error:', data.message);

            if (data.message === 'Ungültiges Wort') {
                addMultiplayerMessage('Das ist kein gültiges Wort!', 'error');
                errorRowCells(); // Shake the current row
            } else {
                addMultiplayerMessage('Fehler: ' + data.message, 'error');
            }

            // If joining specific game failed, create new game
            if (data.message.includes('not found')) {
                addMultiplayerMessage('Erstelle neues Spiel...', 'info');
                ws.send(JSON.stringify({ type: 'createGame' }));
            }
            break;
    }
};

const handleOpponentGuess = (data) => {
    // data.guess is no longer sent. We only use data.result for colors.
    const opponentGuessResult = {
        // word: data.guess, // Not available and not needed for color-only board
        result: data.result,
        guessNumber: data.guessNumber
    };

    // Store opponent's guess (or just its result)
    // Ensure the array is long enough
    while (opponentGuesses.length < data.guessNumber) {
        opponentGuesses.push(null); // Pad with nulls if needed
    }
    opponentGuesses[data.guessNumber - 1] = opponentGuessResult; // Store the result array

    updateOpponentBoard(); // This will re-render using opponentGuesses
    addMultiplayerMessage(`Gegner hat Zug ${data.guessNumber} gemacht.`, 'info'); // Generic message
};

const updateOpponentBoard = () => {
    let opponentBoardContainer = document.querySelector('.opponent-board-display-area');
    if (!opponentBoardContainer) {
        opponentBoardContainer = createOpponentBoardDisplay(); // This creates the area and the board inside
    }
    // Ensure the board display area is visible if we have an opponent and game is active
    if (isMultiplayer && !waitingForOpponent && playerNumber) {
        opponentBoardContainer.style.display = 'block';
    } else {
        opponentBoardContainer.style.display = 'none';
        return; // Don't try to update if not visible
    }

    const opponentBoard = opponentBoardContainer.querySelector('.opponent-board-display');
    if (!opponentBoard) return; // Should not happen if createOpponentBoardDisplay worked

    opponentBoard.innerHTML = ''; // Clear previous state for re-rendering

    for (let r = 0; r < 6; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'opponent-board-display-row';
        for (let c = 0; c < 5; c++) {
            const cellDiv = document.createElement('div');
            cellDiv.className = 'opponent-board-display-cell';
            // Check if there's a guess result for this row
            if (opponentGuesses[r] && opponentGuesses[r].result && opponentGuesses[r].result[c]) {
                const status = opponentGuesses[r].result[c].status;
                let colorClass = '';
                if (status === 'correct') colorClass = 'correct-cell';
                else if (status === 'present') colorClass = 'present-cell';
                else if (status === 'absent') colorClass = 'absent-cell';
                else colorClass = 'gray-cell'; // Default to gray if status is unexpected
                cellDiv.classList.add(colorClass);
            }
            rowDiv.appendChild(cellDiv);
        }
        opponentBoard.appendChild(rowDiv);
    }
};

// createOpponentBoardDisplay remains largely the same but returns the main area div
const createOpponentBoardDisplay = () => {
    const gameContainer = document.querySelector('.game');
    let displayArea = document.querySelector('.opponent-board-display-area');

    if (!displayArea) {
        displayArea = document.createElement('div');
        displayArea.className = 'opponent-board-display-area';
        displayArea.style.display = 'none'; // Initially hidden

        const title = document.createElement('h4');
        title.textContent = 'Gegner:'; // Opponent:
        title.className = 'opponent-board-display-title';
        displayArea.appendChild(title);

        const opponentBoard = document.createElement('div');
        opponentBoard.className = 'opponent-board-display';
        displayArea.appendChild(opponentBoard);

        const keyboard = document.querySelector('.keyboard');
        if (keyboard) {
            gameContainer.insertBefore(displayArea, keyboard);
        } else {
            gameContainer.appendChild(displayArea);
        }
    }
    return displayArea; // Return the main area container
};

const updateMultiplayerUI = () => {
    const title = document.querySelector('.title');
    let opponentBoardArea = document.querySelector('.opponent-board-display-area');

    if (isMultiplayer) {
        if (waitingForOpponent && playerNumber === 1) {
            title.textContent = `1 v 1 Deutschle - Warte auf Gegner...`;
            if (opponentBoardArea) opponentBoardArea.style.display = 'none';
        } else if (playerNumber) {
            title.textContent = `1 v 1 Deutschle - Spieler ${playerNumber}`;
            if (!opponentBoardArea) {
                opponentBoardArea = createOpponentBoardDisplay();
            }
            // Show opponent board if we have an opponent and game is multiplayer
            // Don't hide it just because we're waiting for results
            if (playerNumber && !gameFinished) {
                opponentBoardArea.style.display = 'block';
                updateOpponentBoard(); // Refresh it
            } else {
                if (opponentBoardArea) opponentBoardArea.style.display = 'none';
            }
        }
        title.classList.add('multiplayer');
    } else {
        title.textContent = '1 v 1 Deutschle';
        title.classList.remove('multiplayer');
        if (opponentBoardArea) opponentBoardArea.style.display = 'none';
    }
};

const addMultiplayerMessage = (message, type = 'info') => {
    // Create message container if it doesn't exist
    let messageContainer = document.querySelector('.multiplayer-messages');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.className = 'multiplayer-messages';
        document.querySelector('.timer-container').appendChild(messageContainer);
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `multiplayer-message ${type}`;
    messageDiv.textContent = message;

    messageContainer.appendChild(messageDiv);

    // Remove message after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 5000);
};

const handleMultiplayerGameEnd = (data) => {
    gameFinished = true;
    stopTimer();
    document.removeEventListener('keydown', handleKeydown);

    let message = data.message || 'Spiel beendet';

    // Store the word if provided
    if (data.word) {
        gameWord = data.word;
    }

    // Determine if current player won or lost
    const currentPlayerId = gameState?.playerId;
    const isWinner = data.winner && currentPlayerId && data.winner === currentPlayerId;
    const isLoser = data.winner && currentPlayerId && data.winner !== currentPlayerId;

    console.log('Game ended - Winner:', data.winner, 'Current Player:', currentPlayerId, 'IsWinner:', isWinner, 'IsLoser:', isLoser);

    if (isWinner) {
        // Current player won
        game_won = true;
        handleGameWon();
        addMultiplayerMessage('Du hast gewonnen! 🎉', 'success');
    } else if (isLoser) {
        // Current player lost
        game_lost = true;
        handleGameLost();
        addMultiplayerMessage('Du hast verloren. 😔', 'error');
        // Show additional feedback with the correct word
        if (data.word) {
            addMultiplayerMessage(`Das richtige Wort war: ${data.word}`, 'info');
        }
    } else if (data.endType === 'draw') {
        // Draw game
        game_lost = true; // Treat draw as loss for scoring
        handleGameLost();
        addMultiplayerMessage('Unentschieden! 🤝', 'info');
        if (data.word) {
            addMultiplayerMessage(`Das richtige Wort war: ${data.word}`, 'info');
        }
    } else {
        // Fallback - show generic end message
        game_lost = true;
        handleGameLost();
        addMultiplayerMessage(message, 'info');
        if (data.word) {
            addMultiplayerMessage(`Das richtige Wort war: ${data.word}`, 'info');
        }
    }

    // Ensure opponent board stays visible after game ends
    const opponentBoardArea = document.querySelector('.opponent-board-display-area');
    if (opponentBoardArea && isMultiplayer) {
        opponentBoardArea.style.display = 'block';
        updateOpponentBoard();
    }
};

// Timer functions
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

    if (incorrectGuesses === 0) { // Won on the first try
        return 5000;
    }

    let baseScore = 4000;
    const timePenalty = Math.floor(elapsedTimeInSeconds / 10) * 50; // 50 points off every 10 seconds
    const guessPenalty = incorrectGuesses * 250; // 250 points off for each wrong guess row

    let finalScore = baseScore - timePenalty - guessPenalty;

    return Math.max(1, finalScore); // Ensure score is at least 1 if won
}

window.addEventListener('load', async () => {
    updateActiveCells();

    document.querySelector('.menu-button').addEventListener('click', showMenu);

    document.querySelectorAll("dialog").forEach(dialog => {
        dialog.addEventListener('click', ev => {
            if (ev.target.tagName === "DIALOG") {
                ev.target.close();
            }
        });
    });

    // Connect to WebSocket server for multiplayer
    connectToGameServer();


    const showScoreboardButton = document.getElementById('show-scoreboard-button');
    if (showScoreboardButton) {
        showScoreboardButton.addEventListener('click', showScoreboard);
    }

    // Fix share game button to copy correct URL
    const shareButton = document.querySelector('.share-game-button');
    if (shareButton) {
        shareButton.addEventListener('click', () => {
            const currentUrl = window.location.href;
            navigator.clipboard.writeText(currentUrl).then(() => {
                alert("Link kopiert!");
            }).catch(err => {
                console.error('Failed to copy link:', err);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = currentUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                alert("Link kopiert!");
            });
        });
    }

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
    // Check if the key already has a higher priority color
    let keyboard_key = document.querySelector(`[data-keyboard-key="${key}"]`);
    if (keyboard_key.classList.contains("keyboard-green-key")) {
        return; // Green has highest priority, no need to update
    }
    if (keyboard_key.classList.contains("keyboard-yellow-key") && color !== "green") {
        return; // Yellow has higher priority than gray, no update needed unless it's green
    }
    if (keyboard_key.classList.contains("keyboard-gray-key") && color === "gray") {
        return; // Gray is lowest priority, no update if already gray
    }
    console.log(key, color, `[data-keyboard-key="${key}"]`);
    keyboard_key.classList.add("keyboard-" + color + "-key");
    if (color === "green") {
        keyboard_key.classList.remove("keyboard-yellow-key");
    }
}

const handleKeydown = (e) => {
    // Don't allow input if waiting for opponent or game is finished
    if (waitingForOpponent || gameFinished) {
        return;
    }

    if (keys.includes(e.key.toUpperCase()) || e.key === "Backspace" || e.key === "Enter" || e.key === "ß") {
        updateInput(e.key.toUpperCase());
    }
}

document.addEventListener('keydown', handleKeydown);

const updateCellColor = (cell, color) => {
    cell.classList.remove("active-cell");
    cell.classList.add(color + "-cell");
}

const processGuessResult = (resultData, guessWord) => {
    // Convert server result format to original format if needed
    let result;
    if (Array.isArray(resultData) && resultData[0] && typeof resultData[0] === 'object') {
        // Server format: [{letter: 'H', status: 'correct'}, ...]
        result = resultData.map(cell => cell.status === 'correct' ? 'green' :
            cell.status === 'present' ? 'yellow' : 'gray');
    } else {
        // Original format: ['green', 'yellow', 'gray', ...]
        result = resultData;
    }

    for (let i = 0; i < 5; i++) {
        updateCellColor(document.querySelector(`[data-location="${row_id * 5 + i}"]`), result[i]);
        updateKeyboardKey(guessWord[i], result[i]);
    }

    // Check if won - but don't end game yet in multiplayer
    const isCorrect = result.every(color => color === 'green');
    if (isCorrect && isMultiplayer) {
        addMultiplayerMessage('Richtig! Warte auf Ergebnis des Gegners...', 'success');
        waitingForOpponent = true; // Player has finished, waits for server gameEnd
        // Don't remove keydown listener yet - let handleMultiplayerGameEnd do that
    } else if (isCorrect && !isMultiplayer) {
        handleGameWon();
        return;
    }

    if (row_id === 5 && isMultiplayer && !isCorrect) { // Max guesses in multiplayer and not correct
        addMultiplayerMessage('Alle Versuche aufgebraucht. Warte auf Ergebnis des Gegners...', 'info');
        waitingForOpponent = true; // Player has finished, waits for server gameEnd
        // Don't remove keydown listener yet - let handleMultiplayerGameEnd do that
    } else if (row_id === 5 && !isMultiplayer) {
        handleGameLost();
        return;
    }

    // Continue to next row (only if not waiting for opponent)
    if (!waitingForOpponent) {
        row_id++;
        givenInput = "";
        updateActiveCells();
    }
};

const handleGameWon = () => {
    game_won = true;
    stopTimer();
    document.removeEventListener('keydown', handleKeydown);

    const elapsedTime = getElapsedTime();
    currentScore = calculateScore(elapsedTime, row_id); // row_id is the number of incorrect guess attempts

    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const gameWonDialogText = document.querySelector('#game-won-dialog p');
    gameWonDialogText.innerHTML = `Glückwunsch! Du hast das Wort in ${timeText} erraten.<br>Dein Punktestand: ${currentScore}`;

    const dialogContent = document.querySelector('#game-won-dialog .dialog-content');

    // Create a container for nickname cells
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
    saveScoreButton.classList.add('share-game-button'); // Re-use existing button style
    saveScoreButton.onclick = () => {
        const nickname = nicknameCells.map(cell => cell.value).join('');
        if (nickname.length === 3) {
            const spiel_uuid = getUrlParameter('spiel_uuid');
            if (!spiel_uuid) {
                alert('Keine Spiel-ID gefunden.');
                return;
            }
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

    // Clear previous dynamic content and add new elements
    const existingNicknameInput = dialogContent.querySelector('#nickname-input');
    if (existingNicknameInput) existingNicknameInput.remove();
    const existingSaveButton = dialogContent.querySelector('button');
    if (existingSaveButton && existingSaveButton.textContent === 'Punktestand speichern') existingSaveButton.remove();

    dialogContent.appendChild(nicknameContainer);
    dialogContent.appendChild(saveScoreButton);

    document.querySelector('#game-won-dialog').showModal();
};

const handleGameLost = () => {
    game_lost = true;
    stopTimer();
    currentScore = 0; // Score is 0 for loss, no calculation needed
    document.removeEventListener('keydown', handleKeydown);

    const elapsedTime = getElapsedTime();
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    let lostMessage = `Leider hast du das Wort nicht erraten. Zeit: ${timeText}. Punktestand: ${currentScore}`;

    // In multiplayer, we might know the word from the server
    if (isMultiplayer && gameWord) {
        lostMessage = `Du hast verloren! Das Wort war: ${gameWord}. Zeit: ${timeText}. Punktestand: ${currentScore}`;
    }

    document.querySelector('#game-lost-dialog p').textContent = lostMessage;
    document.querySelector('#game-lost-dialog').showModal();
};

const updateInput = (key) => {
    // Don't allow input if waiting for opponent and game hasn't finished
    if (waitingForOpponent && !gameFinished) {
        return;
    }

    // Start timer on first input (for non-multiplayer or when multiplayer game has started)
    if (!gameStartTime && !gameFinished && (!isMultiplayer || !waitingForOpponent)) {
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
        // only advance when a full 5‐letter word is entered
        if (givenInput.length === 5) {
            if (isMultiplayer && ws && ws.readyState === WebSocket.OPEN) {
                // Send guess to WebSocket server for multiplayer
                ws.send(JSON.stringify({
                    type: 'submitGuess',
                    guess: givenInput
                }));
            } else {
                // Original single-player logic
                const uuid = getUrlParameter('spiel_uuid');
                if (!uuid) {
                    console.error('No spiel_uuid found for single-player game');
                    errorRowCells();
                    return;
                }
                console.log(uuid);
                fetch(`check.php`, {
                    method: "POST",
                    body: JSON.stringify({
                        word: givenInput,
                        uuid: uuid
                    }),
                    headers: {
                        "Content-Type": "application/json"
                    }
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) {
                            errorRowCells();
                            return;
                        }

                        processGuessResult(data.result, givenInput);
                    })
            }
        }
        return;
    }
    writeToBoard();
}

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
    const spiel_uuid = getUrlParameter('spiel_uuid');
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
            scoreboardListDiv.innerHTML = ''; // Clear previous scores

            if (data.length === 0) {
                scoreboardListDiv.textContent = 'Noch keine Einträge für dieses Spiel.';
            } else {
                const ol = document.createElement('ol');
                data.forEach(entry => {
                    const li = document.createElement('li');
                    const date = new Date(entry.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

                    // Use spans for better styling control
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
                        // User's score is already green due to .score class, but keep bold for emphasis
                        nicknameSpan.style.color = 'var(--wordle-yellow)'; // Highlight user's nickname differently
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
