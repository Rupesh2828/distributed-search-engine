import natural from "natural";
import fs from "fs";

// loads the stop words from a file
const stopWords = new Set(fs.readFileSync("src/assets/stopwords.txt", "utf-8").split("\n"));

const tokenizer = new natural.WordTokenizer();  //eg -> converts string to array of words
const stemmer = natural.PorterStemmer;          //converts words to their root form like running -> run

// Multi-word phrases to be treated as a single token
const multiWordPhrases = new Set(["machine learning", "artificial intelligence"]);

const multiWordPhraseTokenizer = new natural.RegexpTokenizer({ pattern: /[\w-]+/ });

/**
//  * Tokenizes, removes stop words, applies stemming, and processes multi-word phrases.
//  * @param text - Raw input text.
//  * @returns An array of processed tokens.
//  */

export function processText(text: string): string[] {
    // Process multi-word phrases first to ensure they are treated as one token
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

