<?php
// Prüfen, ob die Request-Methode POST ist
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['error' => 'Ungültige Request-Methode']);
    http_response_code(405);
    exit;
}

// Die rohen POST-Daten abrufen und JSON dekodieren
$input_data = file_get_contents('php://input');
$data = json_decode($input_data, true);

// Prüfen, ob JSON-Dekodierung erfolgreich war und erforderliche Felder existieren
if (json_last_error() !== JSON_ERROR_NONE || !isset($data['word']) || !isset($data['uuid'])) {
    echo json_encode(['error' => 'Ungültige oder fehlende Daten']);
    http_response_code(400);
    exit;
}


$word =  $data['word'];
$uuid = $data['uuid'];

if (!isset($word)) {
    echo json_encode(['error' => 'Wort ist erforderlich']);
    http_response_code(400);
    exit;
}

if (mb_strlen($word, 'UTF-8') !== 5) {
    echo json_encode(['error' => 'Wort muss 5 Zeichen lang sein']);
    http_response_code(400);
    exit;
}



// Mit der Datenbank verbinden
$conn = new mysqli("localhost:3306", "mariadb", "mariadb", "mariadb");
if ($conn->connect_error) {
    echo json_encode(['error' => 'Datenbankverbindung fehlgeschlagen']);
    http_response_code(500);
    exit;
}

// Ordnungsgemäße Charset für deutsche Zeichen sicherstellen
$conn->set_charset("utf8mb4");

// Prüfen, ob das Wort in der woerter-Tabelle existiert
$stmt = $conn->prepare("SELECT id FROM woerter WHERE word = ?");
$stmt->bind_param("s", $word);
$stmt->execute();
$stmt->store_result();

if ($stmt->num_rows === 0) {
    echo json_encode(['error' => 'Wort im Wörterbuch nicht gefunden']);
    $stmt->close();
    $conn->close();
    exit;
}

// Das echte Wort abrufen, das mit der gegebenen UUID verknüpft ist, mit einem JOIN zwischen spielen und woerter Tabellen
$stmt_real_word = $conn->prepare("SELECT w.word FROM spielen s JOIN woerter w ON s.word_id = w.id WHERE s.uuid = ?");
$stmt_real_word->bind_param("s", $uuid);
$stmt_real_word->execute();
$stmt_real_word->bind_result($real_word);
$stmt_real_word->fetch();
$stmt_real_word->close();

if (!isset($real_word)) {
    echo json_encode(['error' => 'Ungültige UUID oder Wort nicht gefunden']);
    $stmt->close();
    $conn->close();
    exit;
}


function check_word($word, $real_word)
{
    $word = strtolower($word);
    $real_word = strtolower($real_word);
    $result = array_fill(0, 5, 'gray');

    // Erster Durchgang: Korrekte Buchstaben markieren (grün)
    for ($i = 0; $i < 5; $i++) {
        if ($word[$i] === $real_word[$i]) {
            $result[$i] = 'green';
        }
    }

    // Zweiter Durchgang: Teilweise korrekte Buchstaben markieren (gelb), falls Buchstabe irgendwo im echten Wort existiert
    for ($i = 0; $i < 5; $i++) {
        if ($result[$i] !== 'green' && strpos($real_word, $word[$i]) !== false) {
            $result[$i] = 'yellow';
        }
    }

    return $result;
}

$result = check_word($word, $real_word);

echo json_encode(['result' => $result]);

$stmt->close();
$conn->close();
exit;
