const got = require('got');
const compression = require("compression")
const cors = require("cors")
const express = require("express")
const functions = require("firebase-functions/v1")
const createError = require('http-errors');
const { defineString } = require('firebase-functions/params');

const NETWORK_BASE_URL = defineString('NETWORK_BASE_URL').value();
const POKEAPI_VERSION_HASH = defineString('POKEAPI_VERSION_HASH').value()
const POKEAPI_VERSION_DEPLOY_DATE = defineString('POKEAPI_VERSION_DEPLOY_DATE').value()
const endpoints = ["ability","berry","berry-firmness","berry-flavor","characteristic","contest-effect","contest-type","currency","egg-group","encounter-condition","encounter-condition-value","encounter-method","evolution-chain","evolution-trigger","gender","generation","growth-rate","item","item-attribute","item-category","item-fling-effect","item-pocket","language","location","location-area","machine","meta","move","move-ailment","move-battle-style","move-category","move-damage-class","move-learn-method","move-target","nature","pal-park-area","pokeathlon-stat","pokedex","pokemon","pokemon-color","pokemon-form","pokemon-habitat","pokemon-shape","pokemon-species","region","stat","super-contest-effect","type","version","version-group"]
const resources_r = /^[\w\d-_]+$/

function targetUrlForPath(path) {
    let target = NETWORK_BASE_URL + "/_gen" + path.toLowerCase()
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
    return NETWORK_BASE_URL + path.toLowerCase() + "?offset=" + params.offset + "&limit=" + params.limit
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

function handleErrors(reason, req, res, next) {
    if (reason.response && reason.response.statusCode) {
        res.set('Cache-Control', `public, max-age=${failTtl}, s-maxage=${failTtl}`)
        return next(createError(reason.response.statusCode));
    } else if (reason.code === 'ETIMEDOUT') {
        console.error(`504: ${reason.name} for ${req.path}`)
        return next(createError(504, "Upstream timed out"));
    } else {
        console.error(`500: ${reason.name} for ${req.path}`)
        return next(createError(500));
    }
}

function fetchAndReply(req, res, next) {
    const params = paramsOrDefault(req.query)
    got(targetUrlForPath(req.path), gotConfig)
    .json()
    .then(json => {
        res.set('Cache-Control', `public, max-age=${successTtl}, s-maxage=${successTtl}`)
        res.set("X-PokeAPI-Hash", POKEAPI_VERSION_HASH);
        res.set("X-PokeAPI-Deploy-Date", POKEAPI_VERSION_DEPLOY_DATE);
        if ('count' in json && 'results' in json && 'next' in json && 'previous' in json) {
            res.send(
                Object.assign(json, {
                    next: getPageUrl(req.path, getNextPage(params, json.count)),
                    previous: getPageUrl(req.path, getPreviousPage(params)),
                    results: json.results.slice(params.offset, params.offset + params.limit)
                })
            )
        } else {
            res.send(json)
        }
    })
    .catch(reason => {
        handleErrors(reason, req, res, next)
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
api.use(cors({
    origin: '*',
    methods: ['GET', 'HEAD'],
    exposedHeaders: ['X-PokeAPI-Hash', 'X-PokeAPI-Deploy-Date'],
}))

api.get([
    "/api/v2/"
], (req, res, next) => {
    fetchAndReply(req, res, next)
})

api.get([
    "/api/v2/:endpoint/:id/",
    "/api/v2/:endpoint/:id/:extra/"
], (req, res, next) => {
    if (req.params.extra === undefined || req.params.extra === 'encounters') {
        if (endpoints.includes(req.params.endpoint) && req.params.id.match(resources_r)) {
            fetchAndReply(req, res, next)
        } else {
            return next(createError(400, "Invalid endpoint or resource formatting"));
        }
    } else {
        return next(createError(400, "Invalid path"));
    }
})

api.get("/api/v2/:endpoint/", (req, res, next) => {
    if (endpoints.includes(req.params.endpoint)) {
        fetchAndReply(req, res, next)
    } else {
        return next(createError(400, "Invalid endpoint"));
    }
})

// Centralized JSON Error Handler Middleware
api.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    const status = err.status || 500;
    res.status(status).json({
        status: status,
        message: err.message || 'Internal Server Error'
    });
});

exports.api_v1functions = functions.runWith({
    maxInstances: 400,
    memory: "128MB",
    timeoutSeconds: 30,
}).https.onRequest(api)