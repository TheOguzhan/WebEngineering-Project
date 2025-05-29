<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// OPTIONS-Preflight-Request verarbeiten
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Datenbankverbindung einbinden
require_once 'config/database.php';

// Datenbankverbindung mit Umgebungsvariablen abrufen
$conn = getDatabaseConnection();

// UUID aus Query-Parameter erhalten
$uuid = $_GET['uuid'] ?? '';

if (empty($uuid)) {
    http_response_code(400);
    echo json_encode(['error' => 'UUID-Parameter ist erforderlich']);
    exit;
}

try {
    // word_id aus spielen-Tabelle mittels UUID abrufen
    $stmt = $conn->prepare("SELECT word_id FROM spielen WHERE uuid = ?");
    $stmt->bind_param("s", $uuid);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Spiel nicht gefunden']);
        exit;
    }
    
    $row = $result->fetch_assoc();
    $word_id = $row['word_id'];
    $stmt->close();
    
    // Das tatsächliche Wort aus der woerter-Tabelle abrufen
    $stmt = $conn->prepare("SELECT word FROM woerter WHERE id = ?");
    $stmt->bind_param("i", $word_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Wort nicht gefunden']);
        exit;
    }
    
    $word_row = $result->fetch_assoc();
    $word = strtoupper($word_row['word']);
    $stmt->close();
    
    echo json_encode(['word' => $word]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Interner Serverfehler']);
}

$conn->close();
