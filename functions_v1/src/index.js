const got = require('got');
const compression = require("compression")
const cors = require("cors")
const express = require("express")
const functions = require("firebase-functions/v1")

const config = functions.config()
let BASE_URL = "https://pokeapi.co"

if (process.env.FIREBASE_DEBUG_MODE) {
    BASE_URL = "http://localhost:5000"
} else if (config.network && config.network.base_url) {
    BASE_URL = config.network.base_url // To retrieve the config run: `firebase functions:config:get --project <PROJECT_ID>`
}

function targetUrlForPath(path) {
    let target = BASE_URL + "/_gen" + path
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
    return BASE_URL + path + "?offset=" + params.offset + "&limit=" + params.limit
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


const api = express()

api.use(compression())
api.use(cors())

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

api.get([
    "/api/v2/",
    "/api/v2/:endpoint/:id/",
    "/api/v2/:endpoint/:id/:extra/"
], (req, res) => {
    got(targetUrlForPath(req.path), gotConfig)
    .json()
    .then(json => {
        res.set('Cache-Control', `public, max-age=${successTtl}, s-maxage=${successTtl}`)
        res.send(json)
    })
    .catch(reason => {
        handleErrors(reason, req, res)
    })
})

api.get("/api/v2/:endpoint/", (req, res) => {
    got(targetUrlForPath(req.path), gotConfig)
    .json()
    .then(json => {
        const params = paramsOrDefault(req.query)
        res.set('Cache-Control', `public, max-age=${successTtl}, s-maxage=${successTtl}`)
        res.send(
            Object.assign(json, {
                next: getPageUrl(req.path, getNextPage(params, json.count)),
                previous: getPageUrl(req.path, getPreviousPage(params)),
                results: json.results.slice(params.offset, params.offset + params.limit)
            })
        )
    })
    .catch(reason => {
        handleErrors(reason, req, res)
    })
})

exports.api_v1functions = functions.runWith({
    maxInstances: 400,
    memory: "128MB",
    timeoutSeconds: 30,
  }).https.onRequest(api)