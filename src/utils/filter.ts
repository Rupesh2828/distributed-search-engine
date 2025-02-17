import { BloomFilter } from 'bloomfilter';

const BLOOM_FILTER_SIZE = 10_000_000; // Large enough for millions of URLs
const BLOOM_FILTER_HASHES = 7; // Number of hash functions (optimizing for low false positives)

// Create a Bloom filter instance
const bloom = new BloomFilter(BLOOM_FILTER_SIZE, BLOOM_FILTER_HASHES);

export const BloomFilterCache = {
  has: (url: string): boolean => {
    return bloom.test(url);
  },
  add: (url: string): void => {
    bloom.add(url);
  },
};
