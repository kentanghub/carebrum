/**
 * DuckDuckGo Lite scraper — free, no API key needed.
 * Fetches real-time search results for any query.
 */

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://lite.duckduckgo.com/lite/?q=${encoded}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Carebrum/1.0 (research tool; +https://carebrum.vercel.app)',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Search] DuckDuckGo returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseResults(html, maxResults);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[Search] Failed: ${msg}`);
    return [];
  }
}

function parseResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo Lite uses <tr class="result-snippet"> for each result
  // Each result has: <a class="result-link"> for title/url, <td class="result-snippet"> for snippet
  const rowRegex = /<tr[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*class="[^"]*result-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetRegex = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/i;
  const cleanRegex = /<[^>]*>/g;

  let match;
  while ((match = rowRegex.exec(html)) !== null && results.length < max) {
    const row = match[1];

    const linkMatch = linkRegex.exec(row);
    const snippetMatch = snippetRegex.exec(row);

    if (linkMatch) {
      const rawUrl = linkMatch[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '');
      const url = decodeURIComponent(rawUrl);
      const title = linkMatch[2].replace(cleanRegex, '').trim();
      const snippet = snippetMatch
        ? snippetMatch[1].replace(cleanRegex, '').trim().slice(0, 300)
        : '';

      if (title && url.startsWith('http')) {
        results.push({ title, snippet, url });
      }
    }
  }

  return results;
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return '';

  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
    )
    .join('\n\n');
}
