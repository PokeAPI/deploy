#!/bin/sh

set -e

mkdir -p public

# Get stored artifacts from api-data and unpack into the 'public' directory
wget -q -O '_gen.tar.gz' "$(curl -H "Circle-Token: $CIRCLECI_API_TOKEN_NARAMSIM" -s https://circleci.com/api/v1.1/project/github/PokeAPI/api-data/latest/artifacts?branch=staging | jq -r .[0].url)"
if [ $? -ne 0 ]; then
    echo "Couldn't find the latest api-data .tar.gz for the branch staging"
    exit 1
fi
tar xzf _gen.tar.gz -C public

# Get stored artifacts from pokeapi.co and unpack into the current directory
wget -q -O 'static_website.tar.gz' "$(curl -H "Circle-Token: $CIRCLECI_API_TOKEN_NARAMSIM" -s https://circleci.com/api/v1.1/project/github/PokeAPI/pokeapi.co/latest/artifacts?branch=staging | jq -r .[0].url)"
if [ $? -ne 0 ]; then
    echo "Couldn't find the latest pokeapi.co website .tar.gz for the branch staging"
    exit 1
fi
tar xzf static_website.tar.gz -C public

(cd functions && npm ci)
functions/node_modules/.bin/firebase emulators:start --inspect-functions --project="${PROJECT}" &

sleep 30

curl -f http://localhost:5000/api/v2/
curl -f http://localhost:5000/
exit 0