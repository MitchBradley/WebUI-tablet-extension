# Set version
if ($args.Length -eq 0) {
    $version = "$env:USERNAME $(Get-Date -Format s)"
} else {
    $version = $args[0]
}

# Create build directory if it doesn't exist
if (-Not (Test-Path -Path "build")) {
    New-Item -ItemType Directory -Path "build"
}

# Minify CSS
$cssData = Get-Content -Raw -Path "src/tablet.css"
$response = Invoke-RestMethod -Method Post -Uri "https://www.toptal.com/developers/cssminifier/api/raw" -Body @{input=$cssData}
if ($response -match '^{\"errors') {
    Write-Host "Error while minifying tablet.css"
    exit
}
$response | Out-File -FilePath "build/tablet-min.css" -Encoding ascii

# Concatenate JS files
Get-Content -Path "src/*.js" -Raw | Out-File -FilePath "build/all.js" -Encoding ascii

# Minify JS
$jsData = Get-Content -Raw -Path "build/all.js"
$response = Invoke-RestMethod -Method Post -Uri "https://www.toptal.com/developers/javascript-minifier/api/raw" -Body @{input=$jsData}
if ($response -match '^{\"errors') {
    Write-Host "Error while minifying tablet.js"
    $response.Replace('\n', "`n")
    exit
}
$response | Out-File -FilePath "build/tablet-min.js" -Encoding ascii

# Combine and create the final HTML
$style = Get-Content -Raw -Path "build/tablet-min.css"
$script = Get-Content -Raw -Path "build/tablet-min.js"
$html = @"
<style>
$style
</style>
<script>
$script
</script>
<div id='version' class='d-none'>$version</div>
"@
$html | Out-File -FilePath "build/tablet.html" -Encoding ascii

# Compress the final HTML
$gzip = [System.IO.Compression.GzipStream]::new([System.IO.File]::OpenWrite("build/tablet.html.gz"), [System.IO.Compression.CompressionLevel]::Optimal)
[byte[]] $buffer = [System.IO.File]::ReadAllBytes("build/tablet.html")
$gzip.Write($buffer, 0, $buffer.Length)
$gzip.Close()

Write-Host "Output is in build/tablet.html.gz"
