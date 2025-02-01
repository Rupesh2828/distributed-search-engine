import natural from "natural";
import fs from "fs";

const stopWords = new Set(fs.readFileSync("src/assets/stopwords.txt", "utf-8").split("\n"));

const tokenizer = new natural.WordTokenizer();   //splits text into words
const stemmer = natural.PorterStemmer;          //reduces words to their root form

// Multi-word phrases to be treated as a single token
const multiWordPhrases = new Set(["machine learning", "artificial intelligence"]);

const multiWordPhraseTokenizer = new natural.RegexpTokenizer({ pattern: /[\w-]+/ });


export function processText(text: string): string[] {
    multiWordPhrases.forEach((phrase) => {
      text = text.replace(new RegExp(phrase, "gi"), phrase.replace(" ", "_")); 
    }); 
  
    const tokens = tokenizer.tokenize(text);
    const processedTokens = tokens
      .map((token) => token.toLowerCase()) 
      .filter((token) => !stopWords.has(token)) 
      .map((token) => stemmer.stem(token)); 
  
    return multiWordPhraseTokenizer.tokenize(processedTokens.join(" ")); 
  }

export default processText;

