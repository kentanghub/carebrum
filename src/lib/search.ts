/**
 * Multi-source web search — tries multiple free providers.
 * Falls back gracefully when none work.
 */

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  // Try multiple sources in parallel, take whichever responds first with data
  const results = await Promise.race([
    searchDuckDuckGo(query, maxResults),
    searchGoogleCSE(query, maxResults),
    // Fallback timeout — if nothing responds in 6s, give up
    new Promise<SearchResult[]>((resolve) => setTimeout(() => resolve([]), 6000)),
  ]);

  return results;
}

// ─── DuckDuckGo Lite (HTML scraping) ──────────────────────────
async function searchDuckDuckGo(query: string, max: number): Promise<SearchResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; Carebrum/1.0)',
        },
      }
    );

    clearTimeout(timeout);
    const html = await response.text();
    return parseDuckDuckGo(html, max);
  } catch {
    return [];
  }
}

// ─── Google CSE (via Programmable Search, free tier) ──────────
async function searchGoogleCSE(query: string, max: number): Promise<SearchResult[]> {
  // If no CSE configured, skip
  const apiKey = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!apiKey || !cx || apiKey === 'your_key') return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${max}`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();
    return (data.items || []).map((item: any) => ({
      title: item.title || '',
      snippet: item.snippet || '',
      url: item.link || '',
    }));
  } catch {
    return [];
  }
}

// ─── HTML Parser for DuckDuckGo Lite ──────────────────────────
function parseDuckDuckGo(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];
  const cleanHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

  // DuckDuckGo Lite structure keeps changing. Try multiple patterns.
  const rowPattern = /<tr[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetPattern = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/i;

  let match;
  let foundCount = 0;

  // Strategy 1: Parse by result-snippet rows
  while ((match = rowPattern.exec(html)) !== null && results.length < max) {
    const row = match[1];
    foundCount = tryExtract(row);
  }

  // Strategy 2: If nothing found, try broader pattern — look for any link + adjacent text
  if (results.length === 0) {
    const broadRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = html.match(broadRowPattern) || [];
    for (const row of rows) {
      if (results.length >= max) break;
      foundCount = tryExtract(row);
    }
  }

  // Strategy 3: Just extract all links with text
  if (results.length === 0) {
    const allLinks = html.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi) || [];
    for (const linkHtml of allLinks) {
      if (results.length >= max) break;
      const hrefMatch = linkHtml.match(/href="(https?:\/\/[^"]*)"/i);
      const textMatch = linkHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      const url = hrefMatch ? hrefMatch[1] : '';
      const title = textMatch ? cleanHtml(textMatch[1]) : '';
      // Skip tiny links (navigation, etc.)
      if (title.length > 10 && url.length > 20 && !url.includes('duckduckgo.com')) {
        results.push({ title, snippet: '', url });
      }
    }
  }

  function tryExtract(row: string): number {
    const linkMatch = linkPattern.exec(row);
    if (!linkMatch) return 0;

    let url = linkMatch[1];
    if (url.includes('uddg=')) {
      try { url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]); } catch {}
    }
    if (!url.startsWith('http')) return 0;

    const title = cleanHtml(linkMatch[2]);
    if (!title || title.length < 3) return 0;

    const snippetMatch = snippetPattern.exec(row);
    const snippet = snippetMatch ? cleanHtml(snippetMatch[1]).slice(0, 300) : '';

    results.push({ title, snippet, url });
    return 1;
  }

  return results;
}

// ─── Format for prompts ───────────────────────────────────────
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`)
    .join('\n\n');
}
