<?php session_start(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <link rel="stylesheet" href="./styles.css">
    <style>
        /* Multiplayer UI Styles */
        .opponent-section {
            margin: 20px 0;
            display: none;
        }

        .opponent-section h3 {
            color: var(--wordle-gray);
            text-align: center;
            margin-bottom: 10px;
            font-size: 1.2em;
        }

        .opponent-board {
            display: grid;
            grid-template-rows: repeat(6, 1fr);
            gap: 5px;
            max-width: 300px;
            margin: 0 auto;
            transform: scale(0.8);
        }

        .opponent-board-row {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 5px;
        }

        .opponent-cell {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 50px;
            height: 50px;
            border: 2px solid var(--wordle-border-gray);
            font-size: 1.2em;
            font-weight: bold;
            text-transform: uppercase;
            background-color: white;
        }

        .opponent-cell.correct-cell {
            background-color: var(--wordle-green);
            color: white;
            border-color: var(--wordle-green);
        }

        .opponent-cell.present-cell {
            background-color: var(--wordle-yellow);
            color: white;
            border-color: var(--wordle-yellow);
        }

        .opponent-cell.absent-cell {
            background-color: var(--wordle-gray);
            color: white;
            border-color: var(--wordle-gray);
        }

        .multiplayer-messages {
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            max-width: 400px;
            z-index: 100;
        }

        .multiplayer-message {
            background-color: rgba(255, 255, 255, 0.95);
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 8px 12px;
            margin: 5px 0;
            font-size: 0.9em;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            animation: slideIn 0.3s ease-out;
        }

        .multiplayer-message.success {
            background-color: rgba(212, 237, 218, 0.95);
            border-color: var(--wordle-green);
            color: #155724;
        }

        .multiplayer-message.info {
            background-color: rgba(255, 243, 205, 0.95);
            border-color: var(--wordle-yellow);
            color: #856404;
        }

        .multiplayer-message.error {
            background-color: rgba(248, 215, 218, 0.95);
            border-color: #dc3545;
            color: #721c24;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }

            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .timer-container {
            position: relative;
            text-align: center;
            margin-bottom: 20px;
        }

        /* Responsive adjustments for multiplayer */
        @media (max-width: 768px) {
            .opponent-board {
                transform: scale(0.6);
            }

            .opponent-section h3 {
                font-size: 1em;
            }

            .multiplayer-messages {
                max-width: 90%;
            }

            .multiplayer-message {
                font-size: 0.8em;
                padding: 6px 10px;
            }
        }

        /* Game container layout adjustments */
        .game {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }

        /* Title animation for multiplayer status */
        .title {
            transition: color 0.3s ease;
        }

        .title.multiplayer {
            color: var(--wordle-green);
        }
    </style>

    <script src="./1-1-app.js"></script>
    <?php
    // Database connection (adjust credentials as needed)
    $conn = new mysqli("localhost:3306", "mariadb", "mariadb", "mariadb");
    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }
    // Ensure proper charset for German characters
    $conn->set_charset("utf8mb4");

    // Create table if not exists
    $sql = "CREATE TABLE IF NOT EXISTS woerter (
        id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        word VARCHAR(5) NOT NULL
    )";
    $sql_spielen = "CREATE TABLE IF NOT EXISTS spielen (
        id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(36) NOT NULL DEFAULT (UUID()),
        word_id INT(6) UNSIGNED,
        FOREIGN KEY (word_id) REFERENCES woerter(id)
    )";
    $sql_spiel_records = "CREATE TABLE IF NOT EXISTS spiel_records (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        spiel_id INT(6) UNSIGNED,
        score INT UNSIGNED NOT NULL CHECK (score >= 0 AND score <= 5000),
        nickname VARCHAR(3) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (spiel_id) REFERENCES spielen(id)
    )";
    if ($conn->query($sql) !== TRUE) {
        echo "Error creating table: " . $conn->error;
    }
    if ($conn->query($sql_spielen) !== TRUE) {
        echo "Error creating spielen table: " . $conn->error;
    }
    if ($conn->query($sql_spiel_records) !== TRUE) {
        echo "Error creating spiel_records table: " . $conn->error;
    }
    // Check if table is empty and populate from words.txt if needed
    $result = $conn->query("SELECT COUNT(*) as total FROM woerter");
    $row = $result->fetch_assoc();
    if ($row['total'] == 0) {
        $words = file('words.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $stmt = $conn->prepare("INSERT INTO woerter (word) VALUES (?)");
        $stmt->bind_param("s", $word);
        foreach ($words as $word) {
            $word = trim($word);
            if (!empty($word)) {
                $stmt->execute();
            }
        }
        $stmt->close();
    }
    // Create new game and attach UUID to URL if not already set
    if (empty($_GET['spiel_uuid'])) {
        // Pick random word ID between 1 and 3020
        $word_id = 1;
        $stmt_game = $conn->prepare("INSERT INTO spielen (word_id) VALUES (?)");
        $stmt_game->bind_param("i", $word_id);
        $stmt_game->execute();
        $new_id = $stmt_game->insert_id;
        $stmt_game->close();
        // Fetch the generated UUID
        $res_uuid = $conn->query("SELECT uuid FROM spielen WHERE id=$new_id");
        $row_uuid = $res_uuid->fetch_assoc();
        $spiel_uuid = $row_uuid['uuid'];
    } else {
        // Existing game: get word_id for the given UUID
        $spiel_uuid = $_GET['spiel_uuid'];
        $stmt_fetch = $conn->prepare("SELECT word_id FROM spielen WHERE uuid = ?");
        $stmt_fetch->bind_param("s", $spiel_uuid);
        $stmt_fetch->execute();
        $stmt_fetch->bind_result($word_id);
        $stmt_fetch->fetch();
        $stmt_fetch->close();
    }
    // Fetch the actual word for the game
    $stmt_word = $conn->prepare("SELECT word FROM woerter WHERE id = ?");
    $stmt_word->bind_param("i", $word_id);
    $stmt_word->execute();
    $stmt_word->bind_result($spiel_word);
    $stmt_word->fetch();
    $stmt_word->close();
    $conn->close();
    ?>
    <?php if (!empty($spiel_uuid) && empty($_GET['spiel_uuid'])): ?>
        <script>
            (function() {
                var params = new URLSearchParams(window.location.search);
                params.set('spiel_uuid', '<?= $spiel_uuid ?>');
                var newUrl = window.location.pathname + '?' + params.toString();
                window.history.replaceState({}, '', newUrl);
            })();
        </script>
    <?php endif; ?>

</head>

<?php if (!empty($_GET['type']) && !empty($_GET['sdp'])): ?>

    <body data-type="<?= $_GET['type'] ?>" data-sdp="<?= $_GET['sdp'] ?>">

    <?php else: ?>

        <body>
        <?php endif; ?>

        <main class="container">
            <button class="menu-button">⚙️</button>
            <h1 class="title">1 v 1 Deutschle</h1>
            <div class="timer-container">
                <div class="timer" id="game-timer">00:00</div>
            </div>
            <div class="game">
                <div class="game-board">
                    <?php for ($i = 0; $i < 6; $i++) : ?>
                        <div class="game-board-row" data-row="<?= $i ?>">
                            <?php for ($j = 0; $j < 5; $j++) : ?>
                                <div class="game-board-row-cell" data-row="<?= $i ?>" data-column="<?= $j ?>" data-location="<?= $i * 5 + $j ?>"></div>
                            <?php endfor; ?>
                        </div>
                    <?php endfor; ?>
                </div>
                <div class="keyboard">
                    <?php
                    $keyboard_rows = [
                        ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü', 'ß'],
                        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
                        ['↵', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
                    ];
                    foreach ($keyboard_rows as $row) : ?>
                        <div class="keyboard-row">
                            <?php foreach ($row as $key) : ?>
                                <button class="keyboard-key" data-keyboard-key="<?= $key ?>" onclick="updateInput('<?= $key ?>')"><?= $key ?></button>
                            <?php endforeach; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </main>
        <dialog id="game-won-dialog">
            <div class="dialog-content">
                <h1>Gewonnen!</h1>
                <p>Glückwunsch! Du hast das Wort erraten.</p>
                <!-- Nickname input and save button will be added here by JS -->
            </div>
            <a href="/">Nochmal spielen</a>
        </dialog>
        <dialog id="game-lost-dialog">
            <div class="dialog-content">
                <h1>Verloren!</h1>
                <p>Leider hast du das Wort nicht erraten.</p>
                <a href="/">Nochmal spielen</a>
            </div>
        </dialog>

        <dialog id="menu-dialog">
            <div class="dialog-content">
                <h1>Menü</h1>
                <a href="/">Nochmal spielen</a>
                <button class="share-game-button">Teil dieses Spiels 📋</button>
                <a href="/1-1-spielen.php">1 gegen 1 Spiel starten</a>
                <button id="show-scoreboard-button" class="menu-dialog-button">Bestenliste anzeigen</button>
            </div>
        </dialog>

        <dialog id="scoreboard-dialog">
            <div class="dialog-content">
                <h1>Bestenliste für dieses Spiel</h1>
                <div id="scoreboard-list">
                    <!-- Scores will be populated here by JS -->
                </div>
                <button onclick="document.getElementById('scoreboard-dialog').close()" class="menu-dialog-button">Schließen</button>
            </div>
        </dialog>

        </body>

</html>