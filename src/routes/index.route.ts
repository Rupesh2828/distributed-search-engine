import { Router } from "express";
import { addDocument } from "../controllers/index.controller";

const router = Router();

router.post("/indexer/add-document", addDocument)

export default router;

