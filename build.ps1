Function Write-ErrorDetails($Exception) {
    $_.Exception.Message
    if($_.ErrorDetails.Message) {
        "Error Details: "
        $ErrorJson = $_.ErrorDetails.Message | ConvertFrom-Json
        $ErrorJson.errors | Format-List
    }
}

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

# Concatenate CS files
Get-Content -Path "src/*.css" -Raw | Out-File -FilePath "build/all.css" -Encoding ascii

# Minify CSS
$cssData = Get-Content -Raw -Path "build/all.css"
try {
    $response = Invoke-RestMethod -Method Post -Uri "https://www.toptal.com/developers/cssminifier/api/raw" -Body @{input=$cssData}
    $response | Out-File -FilePath "build/tablet-min.css" -Encoding ascii
} catch {
    Write-Host "Error while minifying all.css" -ForegroundColor Red
    Write-ErrorDetails $_
    exit 1
}

# Concatenate JS files
Get-Content -Path "src/*.js" -Raw | Out-File -FilePath "build/all.js" -Encoding ascii

# Minify JS
$jsData = Get-Content -Raw -Path "build/all.js"
try {
    $response = Invoke-RestMethod -Method Post -Uri "https://www.toptal.com/developers/javascript-minifier/api/raw" -Body @{input=$jsData}
    $response | Out-File -FilePath "build/tablet-min.js" -Encoding ascii
} catch {
    Write-Host "Error while minifying all.js" -ForegroundColor Red
    Write-ErrorDetails $_
    exit 1
}

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
