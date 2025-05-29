<?php
// Datenbankverbindung mit Umgebungsvariablen und Fallback-Standardwerten
$db_config = [
    'host' => $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: 'localhost',
    'port' => $_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: '3306', 
    'database' => $_ENV['DB_NAME'] ?? getenv('DB_NAME') ?: 'mariadb',
    'username' => $_ENV['DB_USER'] ?? getenv('DB_USER') ?: 'mariadb',
    'password' => $_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: 'mariadb'
];

function getDatabaseConnection() {
    global $db_config;
    
    $connection_string = $db_config['host'] . ':' . $db_config['port'];
    $conn = new mysqli(
        $connection_string, 
        $db_config['username'], 
        $db_config['password'], 
        $db_config['database']
    );
    
    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }
    
    // Ordnungsgemäße Charset für deutsche Zeichen sicherstellen
    $conn->set_charset("utf8mb4");
    
    return $conn;
}
?> 