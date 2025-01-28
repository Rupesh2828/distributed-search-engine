import { Resolver } from 'dns';

const resolveDNS = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const resolver = new Resolver();
    resolver.resolve4(url, (err, addresses) => {
      if (err) return reject(err);
      resolve(addresses[0]);
    });
  });
};

export { resolveDNS };
