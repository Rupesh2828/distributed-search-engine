import { invertedIndex, docLengths, totalDocs } from './indexer'; 
import processText from './tokenizer';

const controlledTermFrequency = 1.5;  
const controlledLengthNormalization = 0.75;  

// Function to calculate Inverse Document Frequency (IDF)
function idf(term: string): number {
    const df = Object.keys(invertedIndex[term] || {}).length;
    return Math.log(
        //IDF formula: log( (N - df + 0.5) / (df + 0.5) + 1 ), where N = totalDocs  
        ((totalDocs - df + 0.5) / (df + 0.5)) + 1.0
    );
}

// Function to calculate BM25 score for a query and document
export function BM25Score(query: string, docId: number): number {

    const tokens = processText(query);
    let score = 0;

    
    tokens.forEach((token) => {
        if (!invertedIndex[token]) return;  // return if token isn't in the index

        //retrieves term frequency of token in doc, if not then set tf to 0
        const tf = invertedIndex[token][docId] || 0;

        const docLength = docLengths[docId] || 0;

        const averageDocumentLength = Object.values(docLengths).reduce((sum, length) => sum + length, 0) / totalDocs;

        // BM25 formula for this token in the document
        const termScore = idf(token) * (tf * (controlledTermFrequency + 1)) 
        / (tf + controlledTermFrequency * (1 - controlledLengthNormalization + controlledLengthNormalization * docLength / averageDocumentLength));

        
        score += termScore;
    });

    return score;
}
