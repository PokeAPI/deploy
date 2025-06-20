const got = require('got');
const compression = require("compression")
const cors = require("cors")
const express = require("express")
const functions = require("firebase-functions/v1")

const config = functions.config()
const endpoints = ["ability","berry","berry-firmness","berry-flavor","characteristic","contest-effect","contest-type","egg-group","encounter-condition","encounter-condition-value","encounter-method","evolution-chain","evolution-trigger","gender","generation","growth-rate","item","item-attribute","item-category","item-fling-effect","item-pocket","language","location","location-area","machine","move","move-ailment","move-battle-style","move-category","move-damage-class","move-learn-method","move-target","nature","pal-park-area","pokeathlon-stat","pokedex","pokemon","pokemon-color","pokemon-form","pokemon-habitat","pokemon-shape","pokemon-species","region","stat","super-contest-effect","type","version","version-group"]
const resources_r=/^[\w\d-_]+$/
let BASE_URL = "https://pokeapi.co"

if (process.env.FIREBASE_DEBUG_MODE) {
    BASE_URL = "http://localhost:5000"
} else if (config.network && config.network.base_url) {
    BASE_URL = config.network.base_url // To retrieve the config run: `firebase functions:config:get --project <PROJECT_ID>`
}

function targetUrlForPath(path) {
    let target = BASE_URL + "/_gen" + path.toLowerCase()
    if (!target.endsWith("/")) {
        target += "/"
    }
    return (target + "index.json")
}

function paramsOrDefault(query) {
    return {
        offset: parseInt(query.offset) || 0,
        limit: parseInt(query.limit) || 20,
    }
}

function getPageUrl(path, params) {
    if (params === null) {
        return null
    }
    return BASE_URL + path.toLowerCase() + "?offset=" + params.offset + "&limit=" + params.limit
}

function getPreviousPage(params) {
    const newPage = {
        begin: params.offset - params.limit,
        end: params.offset,
    }

    if (newPage.begin < 0) {
        newPage.begin = 0
    }

    // it's a prev page only if we've moved back
    if (newPage.begin < params.offset) {
        return {
            offset: newPage.begin,
            limit: newPage.end - newPage.begin,
        }
    }

    return null
}

function getNextPage(params, count) {
    const newPage = {
        begin: params.offset + params.limit,
        end: params.offset + params.limit * 2,
    }

    if (newPage.end > count) {
        newPage.end = count
    }

    // it's a next page only if we've moved forward
    if (newPage.end > params.offset + params.limit) {
        return {
            offset: newPage.begin,
            limit: newPage.end - newPage.begin,
        }
    }

    return null
}

function handleErrors(reason, req, res) {
    if (reason.response && reason.response.statusCode) {
        res.set('Cache-Control', `public, max-age=${failTtl}, s-maxage=${failTtl}`)
        res.sendStatus(reason.response.statusCode)
    } else if (reason.code === 'ETIMEDOUT') {
        console.error(`504: ${reason.name} for ${req.path}`)
        res.sendStatus(504)
    } else {
        console.error(`500: ${reason.name} for ${req.path}`)
        res.sendStatus(500)
    }
}

function fetchAndReply(req, res, paginated=false) {
    const params = paramsOrDefault(req.query)
    got(targetUrlForPath(req.path), gotConfig)
    .json()
    .then(json => {
        res.set('Cache-Control', `public, max-age=${successTtl}, s-maxage=${successTtl}`)
        if (! paginated) {
            res.send(json)
        } else {
            res.send(
                Object.assign(json, {
                    next: getPageUrl(req.path, getNextPage(params, json.count)),
                    previous: getPageUrl(req.path, getPreviousPage(params)),
                    results: json.results.slice(params.offset, params.offset + params.limit)
                })
            )
        }
    })
    .catch(reason => {
        handleErrors(reason, req, res)
    })
}

const api = express()
const successTtl = 86400 // 1 day
const failTtl = 432000 // 5 days
const gotConfig = {
    timeout: 8000,
    retry: {
        limit: 1,
        statusCodes: [404, 408, 413, 429, 500, 502, 503, 504, 521, 522, 524], // maybe not needed
    },
    hooks: {
        beforeRetry: [
            (options, error, retryCount) => {
                console.log(`${error.name}: retrying ${options.url.pathname}`)
            }
        ]
    }
}

api.use(compression())
api.use(cors())

api.get([
    "/api/v2/"
], (req, res) => {
    fetchAndReply(req, res)
})

api.get([
    "/api/v2/:endpoint/:id/",
    "/api/v2/:endpoint/:id/:extra/"
], (req, res) => {
    if (req.params.extra === undefined || req.params.extra === 'encounters') {
        if (endpoints.includes(req.params.endpoint) && req.params.id.match(resources_r)) {
            fetchAndReply(req, res)
        } else {
            res.sendStatus(400)
        }
    } else {
        res.sendStatus(400)
    }
})

api.get("/api/v2/:endpoint/", (req, res) => {
    if (endpoints.includes(req.params.endpoint)) {
        fetchAndReply(req, res, true)
    } else {
        res.sendStatus(400)
    }

})

exports.api_v1functions = functions.runWith({
    maxInstances: 400,
    memory: "128MB",
    timeoutSeconds: 30,
  }).https.onRequest(api)