import prisma from '../db/connection'; // Prisma ORM for PostgreSQL
import { 
  processDocument, 
  updateContentTsvector, 
  calculateBM25, 
  getCachedResults, 
  cacheSearchResults 
} from '../indexer/indexer'; // Import indexing logic

// Add a document to the index (Create)
export const addDocument = async (document: string, id: number) => {
  const transaction = await prisma.$transaction([
    prisma.documentMetadata.upsert({
      where: { docId: id },
      update: { length: document.split(' ').length },
      create: { docId: id, length: document.split(' ').length },
    }),
  ]);
  
  try {
    const tokens = processDocument(document);
    const docLength = tokens.length;

    // Insert or update document metadata
    await prisma.documentMetadata.upsert({
      where: { docId: id },
      update: { length: docLength },
      create: { docId: id, length: docLength },
    });

    // Insert tokens into the inverted index
    for (const token of tokens) {
      await prisma.invertedIndex.upsert({
        where: { token_docId: { token, docId: id } },
        update: { termFreq: { increment: 1 } },
        create: { token, docId: id, termFreq: 1 },
      });
    }

    // Update content_tsvector field
    await updateContentTsvector(document, id);

    return { message: 'Document added successfully to the index.' };
  } catch (error) {
    console.error('Error adding document to index:', error);
    throw new Error('Failed to add document to index.');
  }
};

// Update an existing document in the index
export const updateDocument = async (document: string, id: number) => {
  try {
    const tokens = processDocument(document);
    const docLength = tokens.length;

    // Update document metadata (length)
    await prisma.documentMetadata.upsert({
      where: { docId: id },
      update: { length: docLength },
      create: { docId: id, length: docLength },
    });

    // Delete existing inverted index entries for the document
    await prisma.invertedIndex.deleteMany({
      where: { docId: id },
    });

    // Insert updated tokens into the inverted index
    for (const token of tokens) {
      await prisma.invertedIndex.upsert({
        where: { token_docId: { token, docId: id } },
        update: { termFreq: { increment: 1 } },
        create: { token, docId: id, termFreq: 1 },
      });
    }

    // Update content_tsvector field
    await updateContentTsvector(document, id);

    return { message: 'Document updated successfully in the index.' };
  } catch (error) {
    console.error('Error updating document in index:', error);
    throw new Error('Failed to update document in index.');
  }
};

// Delete a document from the index
export const deleteDocument = async (id: number) => {
  try {
    // Delete from inverted index
    await prisma.invertedIndex.deleteMany({
      where: { docId: id },
    });
    
    // Delete document metadata
    await prisma.documentMetadata.delete({
      where: { docId: id },
    });

    // Delete the document itself
    await prisma.crawledDocument.delete({
      where: { id },
    });

    return { message: 'Document deleted successfully from the index.' };
  } catch (error) {
    console.error('Error deleting document from index:', error);
    throw new Error('Failed to delete document from index.');
  }
};

// Search for documents in the index
export const searchDocuments = async (query: string) => {
  try {
    // Check for cached search results first
    const cachedResults = await getCachedResults(query);
    if (cachedResults) {
      return { results: cachedResults };
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
      .sort((a, b) => b[1] - a[1]) // Sort by BM25 score
      .map(([docId]) => Number(docId));

    // Cache the results for future use
    await cacheSearchResults(query, sortedResults);

    return { results: sortedResults };
  } catch (error) {
    console.error('Error searching documents:', error);
    throw new Error('Failed to search documents.');
  }
};
