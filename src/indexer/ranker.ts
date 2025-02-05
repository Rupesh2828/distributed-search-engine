import prisma from "../db/connection";
import processText from "./tokenizer";

const controlledTermFrequency = 1.5;
const controlledLengthNormalization = 0.75;

// Function to calculate Inverse Document Frequency (IDF)
async function idf(term: string): Promise<number> {
  const totalDocs = await prisma.documentMetadata.count(); // Get total number of documents

  const df = await prisma.invertedIndex.count({
    where: { token: term }, // Get document frequency for the term
  });

  return Math.log(((totalDocs - df + 0.5) / (df + 0.5)) + 1.0);
}

// Function to calculate BM25 score for a query and document
export async function BM25Score(query: string, docId: number): Promise<number> {
  const tokens = processText(query);
  let score = 0;

  const docData = await prisma.documentMetadata.findUnique({
    where: { docId },
    select: { length: true },
  });

  if (!docData) return 0; // Document doesn't exist

  const docLength = docData.length;

  const avgDocLength = await prisma.documentMetadata.aggregate({
    _avg: { length: true },
  });

  const averageDocumentLength = avgDocLength._avg.length || 1; // Avoid division by zero

  for (const token of tokens) {
    const termData = await prisma.invertedIndex.findUnique({
      where: { token_docId: { token, docId } },
      select: { termFreq: true },
    });

    const tf = termData?.termFreq || 0; // Term frequency in the document

    const termIDF = await idf(token); // Compute IDF

    // Compute BM25 score for this token
    const termScore =
      (termIDF * tf * (controlledTermFrequency + 1)) /
      (tf + controlledTermFrequency * (1 - controlledLengthNormalization + controlledLengthNormalization * (docLength / averageDocumentLength)));

    score += termScore;
  }

  return score;
}
