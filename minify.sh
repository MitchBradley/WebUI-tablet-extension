#! /bin/bash
if test $# == 0; then version=${USER}" "`date --rfc-3339=seconds`; else version=$1; fi
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
cat <(echo "<style>") build/tablet-min.css <(echo "</style>") <(echo "<script>") build/tablet-min.js <(echo "</script>") <(echo "<div id='version' class='d-none'>${version}</div>") | tee test | gzip -c >build/tablet.html.gz
# cat <(echo "<style>") build/tablet-min.css <(echo "</style>") <(echo "<script>") build/tablet-min.js <(echo "</script>") <(echo "<script> id('about').innerText = '${version}'</script>") | tee test | gzip -c >build/tablet.html.gz
