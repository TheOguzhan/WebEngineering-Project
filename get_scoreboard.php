<?php
// get_scoreboard.php
header('Content-Type: application/json');
session_start(); // Session starten, um auf den Spitznamen des Benutzers zuzugreifen

// Datenbankverbindung einbinden
require_once 'config/database.php';

// Datenbankverbindung mit Umgebungsvariablen abrufen
$conn = getDatabaseConnection();

$spiel_uuid = $_GET['spiel_uuid'] ?? null;
$user_nickname_from_session = $_SESSION['user_nickname'] ?? null;

if (empty($spiel_uuid)) {
    echo json_encode(['error' => 'Fehlender spiel_uuid Parameter.']);
    exit;
}

// Die interne spiel.id aus spielen.uuid abrufen
$stmt_get_spiel_id = $conn->prepare("SELECT id FROM spielen WHERE uuid = ?");
$stmt_get_spiel_id->bind_param("s", $spiel_uuid);
$stmt_get_spiel_id->execute();
$result_spiel_id = $stmt_get_spiel_id->get_result();

if ($result_spiel_id->num_rows === 0) {
    echo json_encode(['error' => 'Spiel UUID nicht gefunden.']);
    $stmt_get_spiel_id->close();
    $conn->close();
    exit;
}
$spiel_row = $result_spiel_id->fetch_assoc();
$internal_spiel_id = $spiel_row['id'];
$stmt_get_spiel_id->close();

// Top 5 Punkte für diese spiel_id abrufen
$sql_top_scores = "SELECT nickname, score, created_at FROM spiel_records WHERE spiel_id = ? ORDER BY score DESC, created_at ASC LIMIT 5";
$stmt_top_scores = $conn->prepare($sql_top_scores);
$stmt_top_scores->bind_param("i", $internal_spiel_id);
$stmt_top_scores->execute();
$result_top_scores = $stmt_top_scores->get_result();

$scoreboard = [];
while ($row = $result_top_scores->fetch_assoc()) {
    $scoreboard[] = [
        'nickname' => $row['nickname'],
        'score' => (int)$row['score'],
        'created_at' => $row['created_at'],
        'is_user' => ($user_nickname_from_session === $row['nickname']) // Markieren, ob es der aktuelle Benutzer ist
    ];
}
$stmt_top_scores->close();

// Den neuesten Punktestand des aktuellen Benutzers für diese spiel_id abrufen, falls sie einen Spitznamen in der Session haben
$user_score_entry = null;
if ($user_nickname_from_session) {
    $sql_user_score = "SELECT nickname, score, created_at FROM spiel_records WHERE spiel_id = ? AND nickname = ? ORDER BY created_at DESC LIMIT 1";
    $stmt_user_score = $conn->prepare($sql_user_score);
    $stmt_user_score->bind_param("is", $internal_spiel_id, $user_nickname_from_session);
    $stmt_user_score->execute();
    $result_user_score = $stmt_user_score->get_result();
    if ($user_row = $result_user_score->fetch_assoc()) {
        $user_score_entry = [
            'nickname' => $user_row['nickname'],
            'score' => (int)$user_row['score'],
            'created_at' => $user_row['created_at'],
            'is_user' => true
        ];

        // Benutzerpunktestand zur Bestenliste hinzufügen, falls nicht bereits vorhanden (z.B. falls nicht in Top 5)
        $user_in_scoreboard = false;
        foreach ($scoreboard as $entry) {
            if ($entry['nickname'] === $user_score_entry['nickname'] && $entry['score'] === $user_score_entry['score'] && $entry['created_at'] === $user_score_entry['created_at']) {
                $user_in_scoreboard = true;
                break;
            }
        }
        if (!$user_in_scoreboard) {
            $scoreboard[] = $user_score_entry;
            // Neu sortieren, wenn Benutzerpunktestand hinzugefügt wurde und möglicherweise die Top 5 Ansicht beeinflusst / oder einfach anhängen und kennzeichnen.
            // Der Einfachheit halber hängen wir an und verlassen uns darauf, dass der Client es möglicherweise separat anzeigt, falls nötig.
            // Oder stellen Sie einfach sicher, dass das is_user Flag dem Client hilft, hervorzuheben.
        }
    }
    $stmt_user_score->close();
}

// Sicherstellen, dass alle Einträge in den Top 5 korrekt is_user widerspiegeln, falls sie mit dem Session-Spitznamen übereinstimmen
if ($user_nickname_from_session) {
    foreach ($scoreboard as &$entry) { // Referenz verwenden, um Array direkt zu modifizieren
        if (!$entry['is_user'] && $entry['nickname'] === $user_nickname_from_session) {
            // Diese Logik ist etwas redundant, wenn die anfängliche Abfrage korrekt markiert, aber gut für die Sicherheit
            // falls der Benutzerpunktestand in den Top 5 IST, sollte er bereits durch die erste Schleife markiert worden sein.
            // Der Hauptzweck der zweiten Abfrage ist für Benutzer NICHT in den Top 5.
        }
    }
    unset($entry); // Referenz aufheben
}

echo json_encode($scoreboard);
$conn->close();
