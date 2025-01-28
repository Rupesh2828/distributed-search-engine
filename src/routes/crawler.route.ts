import { Router } from "express";
import { storeCrawledDocument } from "../controllers/crawler.controller";

const router = Router();

router.post("/create-document", storeCrawledDocument)

export default router;

