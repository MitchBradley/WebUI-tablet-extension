#! /bin/bash
mkdir -p build
curl -s -X POST --data-urlencode input@src/tablet.css https://www.toptal.com/developers/cssminifier/api/raw >build/tablet-min.css
if head -1 build/tablet-min.css | grep -q '^{"errors' ; then 
    echo "Error while minifying tablet.css"
    exit
fi
curl -s -X POST --data-urlencode input@src/tablet.js https://www.toptal.com/developers/javascript-minifier/api/raw >build/tablet-min.js
if head -1 build/tablet-min.js | grep -q '^{"errors' ; then 
    echo "Error while minifying tablet.js"
    exit
fi
cat <(echo "<style>") build/tablet-min.css <(echo "</style><script>") build/tablet-min.js <(echo "</script>") | gzip -c >build/tablet.html.gz
