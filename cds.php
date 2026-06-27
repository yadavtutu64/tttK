<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$type = $_GET['type'] ?? '';
$id = $_GET['id'] ?? '';

$base_old = "https://cds-journey-api-gules.vercel.app";
$base_new = "https://cds-api-new.vercel.app/api";

$url = "";

switch($type) {
    case 'batches_old': $url = "$base_old/all-batches"; break;
    case 'batches_new': $url = "$base_new/batches"; break;
    case 'subjects':    $url = "$base_old/subjects/$id"; break;
    case 'batch_detail':$url = "$base_new/batch/$id"; break;
    case 'content':     $url = "$base_old/subject/content/$id"; break;
}

if ($url) {
    // API se data fetch karke user ko bhej rahe hain
    $response = file_get_contents($url);
    echo $response;
} else {
    echo json_encode(["error" => "Invalid Request"]);
}
?>
