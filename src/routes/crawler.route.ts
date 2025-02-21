import { Router, Request, Response, NextFunction } from "express";
import { searchDocuments, storeOrUpdateDocument } from "../controllers/crawler.controller";
import { validateCreateDocument } from "../middleware/validation";

const router = Router();

// Modified route to handle async errors and send response correctly
router.post("/store-document", validateCreateDocument, async (req:Request, res:Response, next:NextFunction) => {
  try {
    const result = await storeOrUpdateDocument(req.body); // assuming you send documentData in the request body
    res.status(200).json(result); // Sending the successful response
  } catch (error) {
    next(error); // Passing errors to the next middleware (error handler)
  }
});

router.get("/search", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await searchDocuments(req, res); // Call the searchDocuments function from the controller
    } catch (error) {
      next(error); // Passing errors to the next middleware (error handler)
    }
  });
  

export default router;
