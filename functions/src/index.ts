import axios from "axios";
import * as compression from "compression"
import * as cors from "cors";
import * as express from "express";
import * as functions from "firebase-functions";
import * as status from "http-status-codes"


const BASE_URL = "https://pokeapi-test-b6137.firebaseapp.com/"; // TODO: support also https://pokeapi-215911.firebaseapp.com conditionally

function targetUrlForPath(path) {
    let target = BASE_URL;
    target += "/_gen";
    target += path;
    if (!target.endsWith("/")) {
        target += "/";
    }
    target += "index.json";
    return target;
}

function paramsOrDefault(query) {
    return {
        offset: parseInt(query.offset) || 0,
        limit: parseInt(query.limit) || 20,
    }
}

function getPageUrl(path, params) {
    if (params === null) {
        return null;
    }
    return BASE_URL + path + "?offset=" + params.offset + "&limit=" + params.limit;
}

function getPreviousPage(params) {
    const newPage = {
        begin: params.offset - params.limit,
        end: params.offset,
    };

    if (newPage.begin < 0) {
        newPage.begin = 0;
    }

    // it's a prev page only if we've moved back
    if (newPage.begin < params.offset) {
        return {
            offset: newPage.begin,
            limit: newPage.end - newPage.begin,
        };
    }

    return null;
}

function getNextPage(params, count) {
    const newPage = {
        begin: params.offset + params.limit,
        end: params.offset + params.limit * 2,
    };

    if (newPage.end > count) {
        newPage.end = count;
    }

    // it's a next page only if we've moved forward
    if (newPage.end > params.offset + params.limit) {
        return {
            offset: newPage.begin,
            limit: newPage.end - newPage.begin,
        }
    }

    return null;
}

const api = express();

api.use(compression());
api.use(cors());

const oneDay = 24 * 60 * 60;

api.get([
    "/api/v2/",
    "/api/v2/:endpoint/:id/",
    "/api/v2/:endpoint/:id/:extra/"
], (req, res) => {
    res.set('Cache-Control', `public, max-age=${oneDay}, s-maxage=${oneDay}`);
    axios.get(targetUrlForPath(req.path))
        .then(target => res.send(target.data))
        .catch(reason => res.sendStatus(status.NOT_FOUND));
});

api.get("/api/v2/:endpoint/", (req, res) => {
    axios.get(targetUrlForPath(req.path))
        .then(target => {
            const params = paramsOrDefault(req.query);
            res.set('Cache-Control', `public, max-age=${oneDay}, s-maxage=${oneDay}`);
            res.send(
                Object.assign(target.data, {
                    next: getPageUrl(req.path, getNextPage(params, target.data.count)),
                    previous: getPageUrl(req.path, getPreviousPage(params)),
                    results: target.data.results.slice(params.offset, params.offset + params.limit)
                })
            )
        })
        .catch(reason => res.sendStatus(status.NOT_FOUND));
});

exports.api = functions.https.onRequest(api);
