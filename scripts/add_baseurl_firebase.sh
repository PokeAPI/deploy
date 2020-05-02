#!/bin/dontexecute
# This script is not intended to be executed
# It is intended to document how to update the configuration of Firebase

# Adds BASE_URL to FireBase config
firebase functions:config:set network.base_url="https://pokeapi-test-b6137.firebaseapp.com" --project "<PROJECT_ID>"
firebase functions:config:set network.base_url="https://pokeapi.co" --project "<PROJECT_ID>"
