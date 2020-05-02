#!/bin/sh
# Executed when the `master` or `staging` branches of PokeAPI/api-data and PokeAPI/pokeapi.co are pushed to
# Runs in CircleCI
# Deploys both pokeapi.co and api-data to Firebase in the respective project
# $FIREBASE_DEPLOY_TOKEN, $FIREBASE_PROJECT_ID, $FIREBASE_DEPLOY_TOKEN_STAGING, $FIREBASE_PROJECT_ID_STAGING are present in CircleCI
# $deploy_location is an environment variable set when the job is triggered by one of the two repositories getting pushed

if [ "${deploy_location:=staging}" = 'master' ]; then # https://stackoverflow.com/a/2013589/3482533
    echo 'Deploying master branches of PokeAPI/api-data and PokeAPI/pokeapi.co to https://pokeapi.co'
    TOKEN=${FIREBASE_DEPLOY_TOKEN}
    PROJECT=${FIREBASE_PROJECT_ID}
elif [ "${deploy_location}" = 'staging' ]; then
    echo 'Deploying staging branches of PokeAPI/api-data and PokeAPI/pokeapi.co to the staging location'
    TOKEN=${FIREBASE_DEPLOY_TOKEN_STAGING}
    PROJECT=${FIREBASE_PROJECT_ID_STAGING}
fi

mkdir -p public

# Get stored artifacts from api-data and unpack into the 'public' directory
wget -O '_gen.tar.gz' --no-check-certificate "$(curl -s https://circleci.com/api/v1.1/project/github/PokeAPI/api-data/latest/artifacts?branch=${deploy_location} | jq -r .[0].url)"
if [ $? -ne 0 ]; then
    echo "Couldn't find the latest api-data .tar.gz for the branch ${deploy_location}"
    exit 1
fi
tar xzf _gen.tar.gz -C public

# Get stored artifacts from pokeapi.co and unpack into the current directory
wget -O 'static_website.tar.gz' --no-check-certificate "$(curl -s https://circleci.com/api/v1.1/project/github/PokeAPI/pokeapi.co/latest/artifacts?branch=${deploy_location} | jq -r .[0].url)"
if [ $? -ne 0 ]; then
    echo "Couldn't find the latest pokeapi.co website .tar.gz for the branch ${deploy_location}"
    exit 1
fi
tar xzf static_website.tar.gz -C public

# Deploy to Firebase
yarn --ignore-engines --cwd functions install
functions/node_modules/.bin/firebase deploy --token="${TOKEN}" --project="${PROJECT}"
