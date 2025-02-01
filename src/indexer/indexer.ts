import fs from 'fs';
import path from 'path';
import processText from './tokenizer';

interface Index {
    [token: string]: Set<number>;
}

let invertedIndex: Index = {};

let documentStore: { [id: number]: string } = {};

function addDocumentToIndex(document: string, id:number): void{
    const tokens = processText(document);

  tokens.forEach((token) => {
    if (!invertedIndex[token]) {
      invertedIndex[token] = new Set();
    }
    invertedIndex[token].add(id); 
  });

  documentStore[id] = document;

}

function searchToken(query: string): number[] {
    const tokens = processText(query);
    const result = new Set<number>();

//for each token in the query, retrieve documents containing it
  tokens.forEach((token) => {
    const docIds = invertedIndex[token];
    if (docIds) {
      docIds.forEach((id) => result.add(id));
    }
  });

  return Array.from(result);
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