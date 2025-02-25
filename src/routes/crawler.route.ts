import { Router, Request, Response, NextFunction } from "express";
import { searchDocuments, storeDocument } from "../controllers/crawler.controller";
import { validateCreateDocument } from "../middleware/validation";

const router = Router();

// Modified route to handle async errors and send response correctly
router.post("/store-document", validateCreateDocument, async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("Received request body:", req.body); // Debug log

    const documentData = req.body; // Get data from Postman
    const result = await storeDocument(documentData); // Call the function

    res.status(200).json(result);
    
  } catch (error) {
    next(error); // Passing errors to the next middleware (error handler)
  }
});

router.get("/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await searchDocuments(req, res); // Pass the request and response to the searchDocuments function
    res.status(200).json(result); // Call the searchDocuments function from the controller
  } catch (error) {
    next(error); // Passing errors to the next middleware (error handler)
  }
});


export default router;
