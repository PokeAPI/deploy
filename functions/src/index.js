const axios = require("axios")
const rax = require('retry-axios')
const compression = require("compression")
const cors = require("cors")
const express = require("express")
const functions = require("firebase-functions")

const config = functions.config()
let BASE_URL = "https://pokeapi.co"
const raxConfig = {
    retry: 1,
    noResponseRetries: 1,
    retryDelay: 100,
    httpMethodsToRetry: ['GET'],
    statusCodesToRetry: [[100, 199], [400, 499], [500, 599]],
    backoffType: 'static',
    onRetryAttempt: err => {
        console.log(`retry attempted for ${err.request.path}. Got ${err.response.status}`)
    }
}

if (config.network && config.network.base_url) {
    BASE_URL = config.network.base_url // To retrieve the config run: `firebase functions:config:get --project <PROJECT_ID>`
}

function targetUrlForPath(path) {
    let target = BASE_URL
    target += "/_gen"
    target += path
    if (!target.endsWith("/")) {
        target += "/"
    }
    target += "index.json"
    return target
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

const interceptorId = rax.attach()
const api = express()

api.use(compression())
api.use(cors())

const oneDay = 24 * 60 * 60

api.get([
    "/api/v2/",
    "/api/v2/:endpoint/:id/",
    "/api/v2/:endpoint/:id/:extra/"
], (req, res) => {
    res.set('Cache-Control', `public, max-age=${oneDay}, s-maxage=${oneDay}`)
    axios({
        url: targetUrlForPath(req.path),
        raxConfig,
    })
    .then(target => res.send(target.data))
    .catch(reason => res.sendStatus(reason.response.status))
})

api.get("/api/v2/:endpoint/", (req, res) => {
    axios({
        url: targetUrlForPath(req.path),
        raxConfig,
    })
    .then(target => {
        const params = paramsOrDefault(req.query)
        res.set('Cache-Control', `public, max-age=${oneDay}, s-maxage=${oneDay}`)
        res.send(
            Object.assign(target.data, {
                next: getPageUrl(req.path, getNextPage(params, target.data.count)),
                previous: getPageUrl(req.path, getPreviousPage(params)),
                results: target.data.results.slice(params.offset, params.offset + params.limit)
            })
        )
    })
    .catch(reason => res.sendStatus(reason.response.status))
})

exports.api = functions.https.onRequest(api)
