import { body } from "express-validator";
import isURL from "validator/lib/isURL"; // Importing isURL from validator
import { ValidationChain } from "express-validator";

interface ValidationError {
  msg: string;
  param: string;
  location: string;
  value: any;
}

interface ValidationResult {
  errors: ValidationError[];
}

export const validateCreateDocument: ValidationChain[] = [
  body("url").isURL().withMessage("URL must be a valid URL"),
  body("content")
    .isString().notEmpty().withMessage("Content must not be empty")
    .isLength({ min: 10, max: 5000 }).withMessage("Content length must be between 10 and 5000 characters"),
  body("crawlDepth")
    .isInt({ min: 0 }).withMessage("Crawl depth must be a non-negative integer")
    .isInt({ max: 10 }).withMessage("Crawl depth cannot exceed 10"), // Optional: add an upper limit
  body("ipAddress").isIP().withMessage("IP Address must be valid"),
  body("links")
    .isArray().withMessage("Links must be an array of strings")
    .custom((value) => value.every((link: string) => typeof link === "string" && isURL(link)))
    .withMessage("Each link must be a valid URL"),
];
