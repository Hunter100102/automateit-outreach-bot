// add near top
import axios from "axios";

// brave web search -> returns a list of result URLs
async function braveSearch(query, { count = 20, offset = 0, country = process.env.SEARCH_COUNTRY || "US", search_lang = process.env.SEARCH_LANG || "en" } = {}) {
  const url = "https://api.search.brave.com/res/v1/web/search";
  const headers = {
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": process.env.BRAVE_API_KEY
  };
  const params = { q: query, count, offset, country, search_lang };

  const { data } = await axios.get(url, { headers, params });

  // Brave's web results are in data.web.results (SearchResult[]).
  // Each item includes a meta_url object with pieces of the URL.
  const results = (data?.web?.results || []).map(r => {
    // try a direct URL if present; otherwise reconstruct from meta_url
    if (r.url) return r.url;
    if (r.meta_url?.url) return r.meta_url.url;
    if (r.meta_url?.scheme && r.meta_url?.netloc) {
      const path = r.meta_url.path ? (r.meta_url.path.startsWith("/") ? r.meta_url.path : `/${r.meta_url.path}`) : "";
      return `${r.meta_url.scheme}://${r.meta_url.netloc}${path}`;
    }
    return null;
  }).filter(Boolean);

  return results;
}
