import { Request, Response } from "express";
import prisma from "../db/connection";
import { 
  processDocument, 
  updateContentTsvector, 
  getCachedResults, 
  cacheSearchResults 
} from "../indexer/indexer"; 
import { BM25Score } from "../indexer/ranker";
import { storeOrUpdateDocument } from "./crawler.controller";

export const addDocument = async (req: Request, res: Response):Promise<void> => {
  try {
    const documentData = req.body;

    // Validate the request body
    if (!documentData.url || !documentData.content || typeof documentData.crawlDepth !== "number" || !documentData.ipAddress) {
       res.status(400).json({ error: "Invalid request fields." });
    }

    const result = await storeOrUpdateDocument(documentData);

     res.status(201).json({ message: "Document processed successfully.", data: result });
  } catch (error) {
    console.error("Error adding document:", error);
     res.status(500).json({ error: "Failed to process document." });
  }
};

export const updateDocument = async (req: Request, res: Response):Promise<void> => {
  try {
    const { document, id } = req.body;

    // Validate the request
    if (!document || typeof document !== "string" || !id || typeof id !== "number") {
       res.status(400).json({ error: "Invalid request. 'document' must be a string and 'id' must be a number." });
    }

    // Process the document and get tokens
    const tokens = await processDocument(document, id); 
    const docLength = tokens.length;

    // Upsert document metadata
    await prisma.documentMetadata.upsert({
      where: { docId: id },
      update: { length: docLength },
      create: { docId: id, length: docLength },
    });

    // Remove old tokens from inverted index for this document
    await prisma.invertedIndex.deleteMany({ where: { docId: id } });

    // Add new tokens to inverted index
    await prisma.invertedIndex.createMany({
      data: tokens.map((token) => ({
        token,
        docId: id,
        termFreq: 1,
      })),
      skipDuplicates: true, 
    });
    

    // Update tsvector for full-text search
    await updateContentTsvector(document, id);

     res.status(200).json({ message: "Document updated successfully." });
  } catch (error) {
    console.error("Error updating document:", error);
     res.status(500).json({ error: "Failed to update document." });
  }
};

// Delete a document
export const deleteDocument = async (req: Request, res: Response):Promise<void> => {
  try {
    const { id } = req.body;

    // Validate the request
    if (!id || typeof id !== "number") {
       res.status(400).json({ error: "Invalid request. 'id' must be a number." });
    }

    // Delete tokens, metadata, and crawled document
    await prisma.invertedIndex.deleteMany({ where: { docId: id } });
    await prisma.documentMetadata.delete({ where: { docId: id } });
    await prisma.crawledDocument.delete({ where: { id } });

     res.status(200).json({ message: "Document deleted successfully." });
  } catch (error) {
    console.error("Error deleting document:", error);
     res.status(500).json({ error: "Failed to delete document." });
  }
};

// Search for documents
export const searchDocuments = async (req: Request, res: Response):Promise<void> => {
  try {
    const { query } = req.body;

    // Validate the request
    if (!query || typeof query !== "string") {
       res.status(400).json({ error: "Invalid request. 'query' must be a string." });
    }

    // Check if results are cached
    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
       res.status(200).json({ results: cachedResults });
    }

    // Process the query and get tokens
    const tokens = await processDocument(query, 0); 
    const resultScores: { [docId: number]: number } = {};

    // Calculate BM25 scores for each document that contains the query tokens
    // Fixed:fetch all document IDs at once instead of querying per token.

    const invertedIndexData = await prisma.invertedIndex.findMany({
      where: { token: { in: tokens } }, // 🛠️ Fetch all at once
    });
    
    const docScores: { [docId: number]: number } = {};
    
    for (const entry of invertedIndexData) {
      const docId = entry.docId;
      if (!docScores[docId]) docScores[docId] = 0;
      docScores[docId] += await BM25Score(query, docId); // BM25 per doc
    }
    

    // Sort results by score
    const sortedResults = Object.entries(resultScores)
      .sort((a, b) => b[1] - a[1])
      .map(([docId]) => Number(docId));

    // Cache the results
    await cacheSearchResults(query, sortedResults);

     res.status(200).json({ results: sortedResults });
  } catch (error) {
    console.error("Error searching documents:", error);
     res.status(500).json({ error: "Failed to search documents." });
  }
};