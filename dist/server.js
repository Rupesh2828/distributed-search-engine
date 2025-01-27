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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
// Define the port
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true, limit: "20kb" }));
app.use((0, cookie_parser_1.default)());
function bootServer() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Connect to the database
            yield prisma.$connect();
            console.log("Connected to Postgres!");
            // Start listening on the defined port
            app.listen(PORT, () => {
                console.log(`Server is running on PORT: ${PORT}`);
            });
        }
        catch (error) {
            console.error("Database connection failed:", error);
            process.exit(1); // Exit the process if DB connection fails
        }
    });
}
bootServer();
