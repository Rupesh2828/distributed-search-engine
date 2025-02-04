import { Request, Response } from "express";
import prisma from "../db/connection";
import { 
  processDocument, 
  updateContentTsvector, 
  calculateBM25, 
  getCachedResults, 
  cacheSearchResults 
} from "../indexer/indexer"; 

// Add a document to the index
export const addDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { document, id } = req.body;

    if (!document || typeof document !== "string" || !id || typeof id !== "number") {
       res.status(400).json({ error: "Invalid request. 'document' must be a string and 'id' must be a number." });
    }

    const tokens = processDocument(document);
    const docLength = tokens.length;

    await prisma.documentMetadata.upsert({
      where: { docId: id },
      update: { length: docLength },
      create: { docId: id, length: docLength },
    });

    for (const token of tokens) {
      await prisma.invertedIndex.upsert({
        where: { token_docId: { token, docId: id } },
        update: { termFreq: { increment: 1 } },
        create: { token, docId: id, termFreq: 1 },
      });
    }

    await updateContentTsvector(document, id);

     res.status(201).json({ message: "Document added successfully to the index." });
  } catch (error) {
    console.error("Error adding document:", error);
       res.status(500).json({ error: "Failed to add document to the index." });
  }
};

// Update an existing document
export const updateDocument = async (req: Request, res: Response) => {
  try {
    const { document, id } = req.body;

    if (!document || typeof document !== "string" || !id || typeof id !== "number") {
      return res.status(400).json({ error: "Invalid request. 'document' must be a string and 'id' must be a number." });
    }

    const tokens = processDocument(document);
    const docLength = tokens.length;

    await prisma.documentMetadata.upsert({
      where: { docId: id },
      update: { length: docLength },
      create: { docId: id, length: docLength },
    });

    //deleting prevs tokens with doc from inverted index cause since the doc is updated, old tokens are not relevant.
    await prisma.invertedIndex.deleteMany({ where: { docId: id } });

    for (const token of tokens) {
      await prisma.invertedIndex.upsert({
        where: { token_docId: { token, docId: id } },
        update: { termFreq: { increment: 1 } },
        create: { token, docId: id, termFreq: 1 },
      });
    }

    await updateContentTsvector(document, id);

    return res.status(200).json({ message: "Document updated successfully." });
  } catch (error) {
    console.error("Error updating document:", error);
    return res.status(500).json({ error: "Failed to update document." });
  }
};

// Delete a document
export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id || typeof id !== "number") {
      return res.status(400).json({ error: "Invalid request. 'id' must be a number." });
    }

    await prisma.invertedIndex.deleteMany({ where: { docId: id } });
    await prisma.documentMetadata.delete({ where: { docId: id } });
    await prisma.crawledDocument.delete({ where: { id } });

    return res.status(200).json({ message: "Document deleted successfully." });
  } catch (error) {
    console.error("Error deleting document:", error);
    return res.status(500).json({ error: "Failed to delete document." });
  }
};

export const searchDocuments = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Invalid request. 'query' must be a string." });
    }

    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
      return res.status(200).json({ results: cachedResults });
    }

    const tokens = processDocument(query);
    const resultScores: { [docId: number]: number } = {};

    for (const token of tokens) {
      const invertedIndexData = await prisma.invertedIndex.findMany({
        where: { token },
      });

      invertedIndexData.forEach((entry) => {
        const docId = entry.docId;
        const score = calculateBM25(query, docId, invertedIndexData);
        resultScores[docId] = (resultScores[docId] || 0) + score;
      });
    }

    const sortedResults = Object.entries(resultScores)
      .sort((a, b) => b[1] - a[1])
      .map(([docId]) => Number(docId));

    await cacheSearchResults(query, sortedResults);

    return res.status(200).json({ results: sortedResults });
  } catch (error) {
    console.error("Error searching documents:", error);
    return res.status(500).json({ error: "Failed to search documents." });
  }
};
