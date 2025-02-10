import { Router } from "express";
import { searchDocuments, storeCrawledDocument } from "../controllers/crawler.controller";

const router = Router();

router.post("/create-document", storeCrawledDocument)
router.post("/search-document", searchDocuments)


export default router;

