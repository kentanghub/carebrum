/**
 * Multi-source web search — Tavily → Brave → Serper → DuckDuckGo fallback chain.
 * Returns structured results with source attribution.
 * Includes Jina Reader for full-page content extraction.
 */

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  score?: number;
  fullContent?: string;
}

/**
 * Search the web using the best available source.
 * Priority: Tavily > Brave > Serper > DuckDuckGo (free fallback)
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

    // 2. Brave Search (free tier: 2000 queries/month)
    if (!results.length && process.env.BRAVE_API_KEY) {
      results = await tryBrave(q, needed);
    }

    // 3. Serper (Google results)
    if (!results.length && process.env.SERPER_API_KEY) {
      results = await trySerper(q, needed);
    }

    // 4. DuckDuckGo (free fallback)
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

/**
 * Crawl full page content using Jina Reader API (free, no API key needed).
 * Returns the main text content of the page.
 */
export async function crawlPage(url: string, maxChars: number = 5000): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
        'X-Timeout': '10',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return '';
    const text = await res.text();
    // Clean up and truncate
    const cleaned = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, maxChars);
  } catch {
    return '';
  }
}

/**
 * Batch crawl multiple URLs with concurrency limit.
 */
export async function crawlPages(
  urls: string[],
  maxChars: number = 3000,
  concurrency: number = 3
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const promises = batch.map(async (url) => {
      const content = await crawlPage(url, maxChars);
      if (content) results.set(url, content);
    });
    await Promise.all(promises);
  }

  return results;
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
      score: r.score,
    }));
  } catch {
    return [];
  }
}

// ─── Brave Search ────────────────────────────────────────────────────────────

async function tryBrave(query: string, max: number): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(max),
      text_decorations: 'false',
      search_lang: 'en',
    });

    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.web?.results || []).map((r: any) => ({
      title: r.title || '',
      snippet: r.description || '',
      url: r.url || '',
      source: 'brave',
      score: r.meta_url?.confidence ? parseFloat(r.meta_url.confidence) : undefined,
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
  // DuckDuckGo blocks cloud IPs (Vercel, AWS, GCP) with 403
  // Try the lite HTML endpoint as last resort
  try {
    const params = new URLSearchParams({ q: query, kl: 'us-en' });
    const res = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const html = await res.text();
    return parseDDGLite(html, max);
  } catch {
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

  // Try Lite format (table rows)
  const rows = html.split(/<tr[^>]*class=['"]result-snippet['"][^>]*/i);
  if (rows.length >= 2) {
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
  }

  // Last resort: generic link extraction
  if (results.length === 0) {
    const genericRegex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([^<]{10,})<\/a>/gi;
    let htmlMatch;
    while ((htmlMatch = genericRegex.exec(html)) && results.length < max) {
      const url = htmlMatch[1];
      const title = clean(htmlMatch[2]);
      if (title && url && !url.includes('duckduckgo.com') && !url.includes('duck.co')) {
        results.push({ title, snippet: '', url, source: 'duckduckgo' });
      }
    }
  }

  return results;
}

/** Format search results for LLM prompt injection */
export function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return '';
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}${r.fullContent ? '\n[Full content available]' : ''}\nURL: ${r.url}`
  ).join('\n\n');
}

/** Get source icon for UI display */
export function getSourceIcon(source: string): string {
  switch (source) {
    case 'tavily': return '🔍';
    case 'brave': return '🦁';
    case 'serper': return '🔎';
    case 'duckduckgo': return '🦆';
    case 'jina': return '📄';
    default: return '🌐';
  }
}
