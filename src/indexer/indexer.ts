import fs from 'fs';
import path from 'path';
import processText from './tokenizer';
import { BM25Score } from './ranker';

interface Index {
  //Store TF for BM25 algo.
    [token: string]: { [docId: number]: number };  
}

export const invertedIndex: Index = {};
let documentStore: { [id: number]: string } = {};
export const docLengths : { [id: number]: number } = {};
export let totalDocs = 0;

function addDocumentToIndex(document: string, id:number): void{
    const tokens = processText(document);
    totalDocs++;
    //stores document length for normalization which is used for BM25 algo
    docLengths[id] = tokens.length

  tokens.forEach((token) => {
    if (!invertedIndex[token]) {
      invertedIndex[token] = {};
    }
    invertedIndex[token][id] = (invertedIndex[token][id] || 0) +1;
  });

  documentStore[id] = document;

}

function searchToken(query: string): number[] {
  const tokens = processText(query);
  const resultScores: { [docId: number]: number } = {};

  tokens.forEach((token) => {
      if (!invertedIndex[token]) return;

      Object.keys(invertedIndex[token]).forEach((docId) => {
          const id = Number(docId);
          resultScores[id] = (resultScores[id] || 0) + BM25Score(query, id);
      });
  });

  return Object.entries(resultScores)
      .sort((a, b) => b[1] - a[1])  // sort by BM25 score descending
      .map(([docId]) => Number(docId));
}

function saveIndexToFile(): void {
    const indexPath = path.join(__dirname, "inverted_index.json");
    fs.writeFileSync(indexPath, JSON.stringify(invertedIndex, null, 2));
  }
  
//   function loadIndexFromFile(): void {
//     const indexPath = path.join(__dirname, "inverted_index.json");
//     if (fs.existsSync(indexPath)) {
//       const data = fs.readFileSync(indexPath, "utf-8");
//       invertedIndex = JSON.parse(data);
//     }
// }

export { addDocumentToIndex, searchToken, saveIndexToFile };