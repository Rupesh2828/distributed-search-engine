import express from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
const prisma = new PrismaClient();

// Define the port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
    cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true,
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(cookieParser());


// Import routes
import crawlerRoutes from "./routes/crawler.route";

// Routes
app.use("/api/v1/crawl", crawlerRoutes);


async function bootServer() {
    try {
        // Connect to the database
        await prisma.$connect();
        console.log("Connected to Postgres!");

        // Start listening on the defined port
        app.listen(PORT, () => {
            console.log(`Server is running on PORT: ${PORT}`);
        });
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1); // Exit the process if DB connection fails
    }
}

bootServer();