/**
 * Multi-provider web search — tries DuckDuckGo Lite (free, fast).
 * Falls back to empty results gracefully.
 */

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Search the web. Returns up to 'max' results.
 * Tries multiple queries for better coverage.
 */
export async function searchWeb(query: string, max: number = 6): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const seen = new Set<string>();

  // Try the exact query + expanded variations for acronyms
  const queries = [query];
  if (query.length <= 10 && query === query.toUpperCase()) {
    // Looks like an acronym — also try common expansions
    queries.push(`${query} Indonesia 2025`);
    queries.push(`${query} program Indonesia`);
  } else {
    queries.push(`${query} Indonesia`);
  }

  for (const q of queries) {
    if (allResults.length >= max) break;
    try {
      const results = await tryDuckDuckGo(q, Math.ceil((max - allResults.length) / queries.length) + 1);
      for (const r of results) {
        const key = r.url || r.title;
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(r);
        }
      }
    } catch (e) {
      // Continue to next query
    }
  }

  return allResults.slice(0, max);
}

async function tryDuckDuckGo(query: string, max: number): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://lite.duckduckgo.com/lite?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const html = await res.text();
    return parseDDGLite(html, max);
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

function parseDDGLite(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];
  const clean = (s: string) =>
    s.replace(/<[^>]*>/g, '')
     .replace(/&[a-z]+;/g, ' ')
     .replace(/\s+/g, ' ')
     .trim();

  // DuckDuckGo Lite has result rows with <a> links followed by <span> snippets
  const rows = html.split(/<tr[^>]*class=['"]result-snippet['"][^>]*>/i);

  if (rows.length < 2 && !html.includes('result-snippet')) {
    // Alternative pattern: <a rel="nofollow" class="result-link">
    const altRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>\s*<span[^>]*class="link-text"[^>]*>([^<]*)<\/span>\s*<td[^>]*class="result-snippet"[^>]*>([^<]*)/gi;
    let altMatch;
    while ((altMatch = altRegex.exec(html)) && results.length < max) {
      const title = clean(altMatch[2]);
      const url = altMatch[1] || '';
      const snippet = clean(altMatch[4]) || clean(altMatch[3]);
      if (title && url && !url.includes('duckduckgo.com')) {
        results.push({ title, snippet, url });
      }
    }
    return results;
  }

  for (let i = 1; i < rows.length && results.length < max; i++) {
    const row = rows[i];

    // Extract link
    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/);
    if (!linkMatch) continue;

    const url = linkMatch[1];
    const title = clean(linkMatch[2]);
    if (!title || !url || url.includes('duckduckgo.com')) continue;

    // Extract snippet (rest of the row after the link)
    const afterLink = row.slice(row.indexOf(linkMatch[0]) + linkMatch[0].length);
    const snippet = clean(afterLink);

    results.push({ title, snippet, url: url.startsWith('//') ? `https:${url}` : url });
  }

  return results;
}

/** Format search results for LLM prompt injection */
export function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return '';
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`
  ).join('\n\n');
}
