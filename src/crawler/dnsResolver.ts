import { Resolver } from 'dns';
import axios from "axios";

const resolveDNS = async (url: string): Promise<string> => {
    const hostname = new URL(url).hostname;

    try {
        // First try to resolve using ip-api
        const response = await axios.get(`http://ip-api.com/json/${hostname}`);
        if (response.data && response.data.query) {
            return response.data.query; // IP from ip-api
        } else {
            throw new Error("IP resolution failed from ip-api");
        }
    } catch (error) {
        console.error("Error using ip-api, falling back to DNS resolver:", error);
        // If ip-api fails, fall back to DNS resolver
        return new Promise((resolve, reject) => {
            const resolver = new Resolver();
            resolver.resolve4(hostname, (err, addresses) => {
                if (err) return reject(err);
                resolve(addresses[0]); // Return the first IP address
            });
        });
    }
};

// Usage
resolveDNS("https://example.com")
    .then(ip => {
        console.log("IP Address:", ip); // Prints the resolved IP address
    })
    .catch(err => {
        console.error("Error resolving DNS:", err);
    });

export { resolveDNS };
