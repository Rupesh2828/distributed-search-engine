// validationMiddleware.ts
import { body } from "express-validator";

// Validation middleware for creating or updating a document
export const validateCreateDocument = [
  body("url").isURL().withMessage("URL must be a valid URL"),
  body("content").isString().notEmpty().withMessage("Content must not be empty"),
  body("crawlDepth").isInt({ min: 0 }).withMessage("Crawl depth must be a non-negative integer"),
  body("ipAddress").isIP().withMessage("IP Address must be valid"),
  body("links").isArray().withMessage("Links must be an array of strings"),
];
