<?php
// save_score.php
header('Content-Type: application/json');
session_start(); // Session starten

// Datenbankverbindung (Anmeldedaten nach Bedarf anpassen)
$conn = new mysqli("localhost:3306", "mariadb", "mariadb", "mariadb");
if ($conn->connect_error) {
    echo json_encode(['error' => 'Verbindung fehlgeschlagen: ' . $conn->connect_error]);
    exit;
}
$conn->set_charset("utf8mb4");

$input = json_decode(file_get_contents('php://input'), true);

$spiel_uuid = $input['spiel_uuid'] ?? null;
$score = $input['score'] ?? null;
$nickname = $input['nickname'] ?? null;

if (empty($spiel_uuid) || !isset($score) || empty($nickname)) {
    echo json_encode(['error' => 'Fehlende erforderliche Parameter.']);
    exit;
}

if (strlen($nickname) > 3) {
    echo json_encode(['error' => 'Spitzname muss 3 Zeichen oder weniger sein.']);
    exit;
}

if ($score < 0 || $score > 5000) {
    echo json_encode(['error' => 'Ungültiger Punktestand.']);
    exit;
}

// Die interne spiel.id basierend auf spiel.uuid abrufen
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
$spiel_id = $spiel_row['id'];
$stmt_get_spiel_id->close();

// In spiel_records einfügen
$stmt_insert_record = $conn->prepare("INSERT INTO spiel_records (spiel_id, score, nickname) VALUES (?, ?, ?)");
$stmt_insert_record->bind_param("iis", $spiel_id, $score, $nickname);

if ($stmt_insert_record->execute()) {
    $_SESSION['user_nickname'] = $nickname; // Spitznamen bei erfolgreichem Speichern in Session speichern
    echo json_encode(['success' => true, 'message' => 'Punktestand erfolgreich gespeichert.']);
} else {
    echo json_encode(['error' => 'Fehler beim Speichern des Punktestands: ' . $stmt_insert_record->error]);
}

$stmt_insert_record->close();
$conn->close();
