#!/bin/sh
# Executed when the `master` or `staging` branches of PokeAPI/api-data and PokeAPI/pokeapi.co are pushed to
# Runs in CircleCI
# Deploys both pokeapi.co and api-data to Firebase in the respective project
# $FIREBASE_DEPLOY_TOKEN, $FIREBASE_PROJECT_ID, $FIREBASE_DEPLOY_TOKEN_STAGING, $FIREBASE_PROJECT_ID_STAGING are present in CircleCI
# $deploy_location is an environment variable set when the job is triggered by one of the two repositories getting pushed. If not present then the deploy was triggered by a commit on the master or staging branch of this very repository.

if [ "${deploy_location:=$CIRCLE_BRANCH}" = 'master' ]; then # bash parameter expansion (assign default value)
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
wget -q -O '_gen.tar.gz' "$(curl -H "Circle-Token: $CIRCLECI_API_TOKEN_NARAMSIM" -s https://circleci.com/api/v1.1/project/github/PokeAPI/api-data/latest/artifacts?branch="${deploy_location}" | jq -r .[0].url)"
if [ $? -ne 0 ]; then
    echo "Couldn't find the latest api-data .tar.gz for the branch ${deploy_location}"
    exit 1
fi
tar xzf _gen.tar.gz -C public

# Get stored artifacts from pokeapi.co and unpack into the current directory
wget -q -O 'static_website.tar.gz' "$(curl -H "Circle-Token: $CIRCLECI_API_TOKEN_NARAMSIM" -s https://circleci.com/api/v1.1/project/github/PokeAPI/pokeapi.co/latest/artifacts?branch="${deploy_location}" | jq -r .[0].url)"
if [ $? -ne 0 ]; then
    echo "Couldn't find the latest pokeapi.co website .tar.gz for the branch ${deploy_location}"
    exit 1
fi
tar xzf static_website.tar.gz -C public

# Deploy to Firebase
(cd functions_v1 && npm ci)
# (cd functions_v2 && npm ci) # Not used due to high costs. When v1 will be sunsetting, switch to v2
functions_v1/node_modules/.bin/firebase deploy --token="$TOKEN" --project="${PROJECT}" --only functions:api_v1functions,hosting
