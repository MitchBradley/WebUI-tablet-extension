#! /bin/bash
if test $# == 0; then version=${USER}" "`date --rfc-3339=seconds`; else version=$1; fi
mkdir -p build
cat src/tablet/*.css src/webui3/*.css >build/all.css
curl -s -X POST --data-urlencode input@build/all.css https://www.toptal.com/developers/cssminifier/api/raw >build/tablet-min.css
if head -1 build/tablet-min.css | grep -q '^{"errors' ; then 
    echo "Error while minifying all.css"
    sed -s "s/\\\\n/\n/g" <build/tablet-min.css
    exit
fi
cat src/tablet/*.js src/webui3/*.js >build/all.js
curl -s -X POST --data-urlencode input@build/all.js https://www.toptal.com/developers/javascript-minifier/api/raw >build/tablet-min.js
if head -1 build/tablet-min.js | grep -q '^{"errors' ; then 
    echo "Error while minifying all.js"
    sed -s "s/\\\\n/\n/g" <build/tablet-min.js
    echo
    exit
fi
cat <(echo "<style>") build/tablet-min.css <(echo "</style>") <(echo "<script>") build/tablet-min.js <(echo "</script>") <(echo "<div id='version' class='d-none'>${version}</div>") > build/tablet.html
gzip -c < build/tablet.html >build/tablet.html.gz
echo "Output is in build/tablet.html.gz"
# cp build/tablet.html /GitHub/WebUI-mm/server/CNC/FluidNC/Flash
