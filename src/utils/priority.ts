const computeUrlPriority = (url: string): number => {
    let priority = 0;
  
    const normalizedUrl = url.toLowerCase();
  
    if (normalizedUrl.includes("news") || normalizedUrl.includes("blog")) priority += 20;
    if (normalizedUrl.includes(".gov") || normalizedUrl.includes(".edu")) priority += 25;
  
    if (normalizedUrl.includes("latest") || normalizedUrl.includes("update")) priority += 15;
    if (normalizedUrl.includes("breaking") || normalizedUrl.includes("trending")) priority += 20;
  
    if (url.split("/").length <= 4) priority += 10; 
  
    const fakeBacklinkScore = Math.floor(Math.random() * 50); 
    priority += fakeBacklinkScore;
  
    if (normalizedUrl.includes("ads") || normalizedUrl.includes("tracking")) priority -= 10;
    if (normalizedUrl.includes("login") || normalizedUrl.includes("signup")) priority -= 15;
  
    if (normalizedUrl.startsWith("https://")) priority += 5;
  
    return Math.max(priority, 1); 
  };
  
  export { computeUrlPriority };
  