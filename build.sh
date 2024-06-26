#! /bin/bash
if test $# == 0; then version=${USER}" "`date --rfc-3339=seconds`; else version=$1; fi
mkdir -p build
curl -s -X POST --data-urlencode input@src/tablet.css https://www.toptal.com/developers/cssminifier/api/raw >build/tablet-min.css
if head -1 build/tablet-min.css | grep -q '^{"errors' ; then 
    echo "Error while minifying tablet.css"
    exit
fi
cat src/*.js >build/all.js
curl -s -X POST --data-urlencode input@build/all.js https://www.toptal.com/developers/javascript-minifier/api/raw >build/tablet-min.js
if head -1 build/tablet-min.js | grep -q '^{"errors' ; then 
    echo "Error while minifying tablet.js"
    sed -s "s/\\\\n/\n/g" <build/tablet-min.js
    echo
    exit
fi
cat <(echo "<style>") build/tablet-min.css <(echo "</style>") <(echo "<script>") build/tablet-min.js <(echo "</script>") <(echo "<div id='version' class='d-none'>${version}</div>") | gzip -c >build/tablet.html.gz
echo "Output is in build/tablet.html.gz"
