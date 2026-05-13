/**
 * Multi-source web search — Tavily → Serper → DuckDuckGo fallback chain.
 * Returns structured results with source attribution.
 */

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

/**
 * Search the web using the best available source.
 * Priority: Tavily > Serper > DuckDuckGo (free fallback)
 */
export async function searchWeb(query: string, max: number = 6): Promise<SearchResult[]> {
  const queries = buildQueries(query);
  const allResults: SearchResult[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (allResults.length >= max) break;
    const needed = max - allResults.length;

    // Try sources in order
    let results: SearchResult[] = [];

    // 1. Tavily (best quality)
    if (process.env.TAVILY_API_KEY) {
      results = await tryTavily(q, needed);
    }

    // 2. Serper (Google results)
    if (!results.length && process.env.SERPER_API_KEY) {
      results = await trySerper(q, needed);
    }

    // 3. DuckDuckGo (free fallback)
    if (!results.length) {
      results = await tryDuckDuckGo(q, needed);
    }

    for (const r of results) {
      const key = r.url || r.title;
      if (!seen.has(key)) {
        seen.add(key);
        allResults.push(r);
      }
    }
  }

  return allResults.slice(0, max);
}

function buildQueries(query: string): string[] {
  const queries = [query];

  // Indonesia context
  if (!/indonesia/i.test(query)) {
    queries.push(`${query} Indonesia`);
  }

  // Acronym expansion
  const acronymMatch = query.match(/\b[A-Z]{2,5}\b/g);
  if (acronymMatch) {
    const acronym = acronymMatch[0];
    queries.push(`${acronym} adalah program Indonesia`);
    queries.push(`${query} terbaru 2025`);
  }

  // Remove question words for broader search
  const noQuestion = query.replace(/^(apakah|apa|bagaimana|mengapa|kenapa|siapa|kapan|dimana)\s+/i, '');
  if (noQuestion !== query) {
    queries.push(noQuestion);
  }

  return [...new Set(queries)].slice(0, 4);
}

// ─── Tavily ─────────────────────────────────────────────────────────────────

async function tryTavily(query: string, max: number): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: max,
        include_answer: false,
        search_depth: 'basic',
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: r.title || '',
      snippet: r.content || r.snippet || '',
      url: r.url || '',
      source: 'tavily',
    }));
  } catch {
    return [];
  }
}

// ─── Serper (Google) ────────────────────────────────────────────────────────

async function trySerper(query: string, max: number): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({ q: query, num: max }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map((r: any) => ({
      title: r.title || '',
      snippet: r.snippet || '',
      url: r.link || '',
      source: 'serper',
    }));
  } catch {
    return [];
  }
}

// ─── DuckDuckGo (Free) ──────────────────────────────────────────────────────

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

  const rows = html.split(/<tr[^>]*class=['"]result-snippet['"][^>]*>/i);

  if (rows.length < 2 && !html.includes('result-snippet')) {
    const altRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>\s*<span[^>]*class="link-text"[^>]*>([^<]*)<\/span>\s*<td[^>]*class="result-snippet"[^>]*>([^<]*)/gi;
    let altMatch;
    while ((altMatch = altRegex.exec(html)) && results.length < max) {
      const title = clean(altMatch[2]);
      const url = altMatch[1] || '';
      const snippet = clean(altMatch[4]) || clean(altMatch[3]);
      if (title && url && !url.includes('duckduckgo.com')) {
        results.push({ title, snippet, url, source: 'duckduckgo' });
      }
    }
    return results;
  }

  for (let i = 1; i < rows.length && results.length < max; i++) {
    const row = rows[i];
    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/);
    if (!linkMatch) continue;

    const url = linkMatch[1];
    const title = clean(linkMatch[2]);
    if (!title || !url || url.includes('duckduckgo.com')) continue;

    const afterLink = row.slice(row.indexOf(linkMatch[0]) + linkMatch[0].length);
    const snippet = clean(afterLink);

    results.push({ title, snippet, url: url.startsWith('//') ? `https:${url}` : url, source: 'duckduckgo' });
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

/** Get source icon for UI display */
export function getSourceIcon(source: string): string {
  switch (source) {
    case 'tavily': return '🔍';
    case 'serper': return '🔎';
    case 'duckduckgo': return '🦆';
    default: return '🌐';
  }
}
