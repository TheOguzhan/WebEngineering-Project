<?php session_start(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wortduell</title>
    <link rel="stylesheet" href="./1v1.css">
    <script src="./1v1.js"></script>
    <link rel="icon" href="./favicon.png">
    <?php
    // Datenbankverbindung einbinden
    require_once 'config/database.php';

    // Datenbankverbindung mit Umgebungsvariablen abrufen
    $conn = getDatabaseConnection();

    // Tabellen erstellen, falls nicht vorhanden
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
    // Prüfen, ob Tabelle leer ist und mit words.txt befüllen, falls nötig
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
    // Neues Spiel erstellen und UUID zur URL hinzufügen, falls noch nicht gesetzt
    if (empty($_GET['spiel_uuid'])) {
        // Zufällige Wort-ID zwischen 1 und 3020 wählen
        $word_id = rand(1, 3012);
        $stmt_game = $conn->prepare("INSERT INTO spielen (word_id) VALUES (?)");
        $stmt_game->bind_param("i", $word_id);
        $stmt_game->execute();
        $new_id = $stmt_game->insert_id;
        $stmt_game->close();
        // Die generierte UUID abrufen
        $res_uuid = $conn->query("SELECT uuid FROM spielen WHERE id=$new_id");
        $row_uuid = $res_uuid->fetch_assoc();
        $spiel_uuid = $row_uuid['uuid'];
    } else {
        // Vorhandenes Spiel: word_id für die gegebene UUID abrufen
        $spiel_uuid = $_GET['spiel_uuid'];
        $stmt_fetch = $conn->prepare("SELECT word_id FROM spielen WHERE uuid = ?");
        $stmt_fetch->bind_param("s", $spiel_uuid);
        $stmt_fetch->execute();
        $stmt_fetch->bind_result($word_id);
        $stmt_fetch->fetch();
        $stmt_fetch->close();
    }
    // Das tatsächliche Wort für das Spiel abrufen
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

<body>
    <main class="container">
        <button class="menu-button">⚙️</button>
        <h1 class="title">Wortduell</h1>

        <!-- Connection Status -->
        <div class="connection-status" id="connection-status">
            <span id="status-text">Verbindung wird hergestellt...</span>
            <span id="player-count">Spieler: 0/2</span>
        </div>

        <div class="timer-container">
            <div class="timer" id="game-timer">00:00</div>
        </div>

        <!-- Opponent Board Display -->
        <div class="opponent-board-display-area" id="opponent-board-display">
            <h4 id="opponent-name">Warten auf Gegner...</h4>
            <div class="opponent-board-display">
                <?php for ($i = 0; $i < 6; $i++) : ?>
                    <div class="opponent-board-display-row" data-opponent-row="<?= $i ?>">
                        <?php for ($j = 0; $j < 5; $j++) : ?>
                            <div class="opponent-board-display-cell" data-opponent-row="<?= $i ?>" data-opponent-col="<?= $j ?>"></div>
                        <?php endfor; ?>
                    </div>
                <?php endfor; ?>
            </div>
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
            <p>Du hast das Wort leider nicht erraten.</p>
            <p>Das gesuchte Wort war: <strong><?= htmlspecialchars($spiel_word) ?></strong></p>
            <p>Bitte warte, bis dein Gegner das Spiel beendet hat.</p>
        </div>
    </dialog>

    <dialog id="menu-dialog">
        <div class="dialog-content">
            <h1>Menü</h1>
            <a href="/">Nochmal spielen</a>
            <button class="share-game-button">Teil dieses Spiels 📋</button>
            <a href="/1v1.php">1 gegen 1 Spiel starten</a>
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

    <!-- Multiplayer-specific dialogs -->
    <dialog id="opponent-won-dialog">
        <div class="dialog-content">
            <h1>Gegner gewonnen!</h1>
            <p id="opponent-won-text">Dein Gegner hat das Wort erraten und gewonnen!</p>
            <a href="/">Neues Spiel starten</a>
        </div>
    </dialog>

    <dialog id="game-over-opponent-also-lost-dialog">
        <div class="dialog-content">
            <h1>Spiel vorbei</h1>
            <p>Dein Gegner hat das Wort ebenfalls nicht erraten.</p>
            <p>Das gesuchte Wort war: <strong><?= htmlspecialchars($spiel_word) ?></strong></p>
            <a href="/">Neues Spiel starten</a>
        </div>
    </dialog>

    <dialog id="opponent-disconnected-dialog">
        <div class="dialog-content">
            <h1>Gegner getrennt</h1>
            <p>Dein Gegner hat die Verbindung getrennt. Du kannst weiter spielen oder ein neues Spiel starten.</p>
            <button onclick="document.getElementById('opponent-disconnected-dialog').close()" class="menu-dialog-button">Weiter spielen</button>
            <a href="/">Neues Spiel starten</a>
        </div>
    </dialog>

    <dialog id="connection-error-dialog">
        <div class="dialog-content">
            <h1>Verbindungsfehler</h1>
            <p>Die Verbindung zum Server ist fehlgeschlagen. Überprüfe deine Internetverbindung.</p>
            <button onclick="location.reload()" class="menu-dialog-button">Seite neu laden</button>
        </div>
    </dialog>

</body>

</html>