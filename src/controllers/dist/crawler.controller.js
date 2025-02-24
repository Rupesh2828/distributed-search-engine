"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.deleteDocument = exports.searchDocuments = exports.isUrlCrawled = exports.storeDocument = void 0;
var crypto_1 = require("crypto");
var connection_1 = require("../db/connection");
var indexer_1 = require("../indexer/indexer");
var queueManager_1 = require("../crawler/queue/queueManager");
exports.storeDocument = function (documentData) { return __awaiter(void 0, void 0, void 0, function () {
    var url, content, crawlDepth, ipAddress, links, existingDoc, contentHash, newDoc, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                url = documentData.url, content = documentData.content, crawlDepth = documentData.crawlDepth, ipAddress = documentData.ipAddress, links = documentData.links;
                if (!url || !content || typeof crawlDepth !== "number" || !ipAddress) {
                    throw new Error("Missing or invalid required fields.");
                }
                return [4 /*yield*/, connection_1["default"].crawledDocument.findUnique({ where: { url: url } })];
            case 1:
                existingDoc = _a.sent();
                if (existingDoc) {
                    console.log("Exact duplicate detected: " + url);
                    return [2 /*return*/, { message: "Document already exists", existingDocument: existingDoc }];
                }
                contentHash = crypto_1["default"].createHash("sha256").update(content).digest("hex");
                return [4 /*yield*/, connection_1["default"].crawledDocument.create({
                        data: {
                            url: url,
                            content: content,
                            contentHash: contentHash,
                            crawlDepth: crawlDepth,
                            ipAddress: ipAddress,
                            links: { create: links.map(function (link) { return ({ url: link }); }) }
                        }
                    })];
            case 2:
                newDoc = _a.sent();
                console.log("Stored document successfully: " + newDoc.url);
                return [2 /*return*/, { message: "Document added successfully", storedDoc: newDoc }];
            case 3:
                error_1 = _a.sent();
                console.error("Error storing document:", error_1);
                return [2 /*return*/, { message: "Failed to store document.", error: error_1.message }];
            case 4: return [2 /*return*/];
        }
    });
}); };
// 🔹 Check if URL is Crawled
exports.isUrlCrawled = function (url) { return __awaiter(void 0, void 0, Promise, function () {
    var count, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, connection_1["default"].crawledDocument.count({ where: { url: url } })];
            case 1:
                count = _a.sent();
                return [2 /*return*/, count > 0];
            case 2:
                error_2 = _a.sent();
                console.error("Error checking if URL is crawled: " + url, error_2);
                throw new Error("Failed to check URL status.");
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.searchDocuments = function (req, res) { return __awaiter(void 0, void 0, Promise, function () {
    var query_1, cachedResults, documents, searchURLs, _i, searchURLs_1, url, queueError_1, responseSent_1, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 11, , 12]);
                query_1 = req.query.q;
                console.log("Search query:", query_1);
                if (!query_1 || typeof query_1 !== "string") {
                    res.status(400).json({ error: "Invalid request. 'query' must be a string." });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, indexer_1.getCachedResults(query_1)];
            case 1:
                cachedResults = _a.sent();
                console.log("Cached Results:", cachedResults);
                // If results are found in the cache, return them immediately
                if (cachedResults) {
                    console.log("Cache hit. Returning cached results.");
                    res.status(200).json({ results: cachedResults });
                    return [2 /*return*/];
                }
                // 2. Check Database for Documents
                console.log("Cache miss. Searching database...");
                return [4 /*yield*/, connection_1["default"].crawledDocument.findMany({
                        where: { content: { contains: query_1, mode: 'insensitive' } },
                        select: { url: true, content: true }
                    })];
            case 2:
                documents = _a.sent();
                console.log("Fetched Documents:", documents);
                if (!(documents.length > 0)) return [3 /*break*/, 4];
                console.log("Documents found. Caching and returning results.");
                return [4 /*yield*/, indexer_1.cacheSearchResults(query_1, documents)];
            case 3:
                _a.sent(); // Cache the results for future queries
                res.status(200).json({ results: documents });
                return [2 /*return*/];
            case 4:
                // 3. Handle No Results: Trigger Crawling if No Documents Found
                console.log("No results found in the database. Triggering crawl for: " + query_1);
                searchURLs = [
                    "https://www.google.com/search?q=" + encodeURIComponent(query_1),
                    "https://en.wikipedia.org/wiki/" + encodeURIComponent(query_1),
                    "https://www.reddit.com/search/?q=" + encodeURIComponent(query_1),
                ];
                _i = 0, searchURLs_1 = searchURLs;
                _a.label = 5;
            case 5:
                if (!(_i < searchURLs_1.length)) return [3 /*break*/, 10];
                url = searchURLs_1[_i];
                console.log("Adding crawl job to queue:", url);
                _a.label = 6;
            case 6:
                _a.trys.push([6, 8, , 9]);
                return [4 /*yield*/, queueManager_1.urlQueue.add("crawlJob", { url: url, depth: 0 })];
            case 7:
                _a.sent();
                console.log("Successfully added crawl job for URL: " + url);
                return [3 /*break*/, 9];
            case 8:
                queueError_1 = _a.sent();
                console.error("Failed to add crawl job for URL: " + url, queueError_1);
                return [3 /*break*/, 9];
            case 9:
                _i++;
                return [3 /*break*/, 5];
            case 10:
                responseSent_1 = false;
                setTimeout(function () { return __awaiter(void 0, void 0, void 0, function () {
                    var newDocuments;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (responseSent_1)
                                    return [2 /*return*/];
                                console.log("Re-searching database after delay...");
                                return [4 /*yield*/, connection_1["default"].crawledDocument.findMany({
                                        where: { content: { contains: query_1, mode: 'insensitive' } },
                                        select: { url: true, content: true }
                                    })];
                            case 1:
                                newDocuments = _a.sent();
                                if (!(newDocuments.length > 0)) return [3 /*break*/, 3];
                                console.log("New documents found after crawling. Returning results.");
                                return [4 /*yield*/, indexer_1.cacheSearchResults(query_1, newDocuments)];
                            case 2:
                                _a.sent();
                                res.status(200).json({ results: newDocuments });
                                return [3 /*break*/, 4];
                            case 3:
                                res.status(202).json({ message: "Crawling initiated. Check back soon for results." });
                                _a.label = 4;
                            case 4:
                                responseSent_1 = true;
                                return [2 /*return*/];
                        }
                    });
                }); }, 10000); // Delay in milliseconds (e.g., 10 seconds)
                return [3 /*break*/, 12];
            case 11:
                error_3 = _a.sent();
                // 4. Catch and Log Errors
                console.error("Error during search operation:", error_3);
                res.status(500).json({ error: "Failed to process search query." });
                return [3 /*break*/, 12];
            case 12: return [2 /*return*/];
        }
    });
}); };
// 🔹 Delete a Document
exports.deleteDocument = function (req, res) { return __awaiter(void 0, void 0, Promise, function () {
    var id, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.body.id;
                if (!id || typeof id !== "number") {
                    res.status(400).json({ error: "Invalid request. 'id' must be a number." });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, connection_1["default"].crawledDocument["delete"]({ where: { id: id } })];
            case 1:
                _a.sent();
                res.status(200).json({ message: "Document deleted successfully." });
                return [3 /*break*/, 3];
            case 2:
                error_4 = _a.sent();
                console.error("Error deleting document:", error_4);
                res.status(500).json({ error: "Failed to delete document." });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
