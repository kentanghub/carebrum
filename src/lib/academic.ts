/**
 * Academic paper search — Semantic Scholar + ArXiv
 * Free APIs, no keys needed.
 */

export interface AcademicPaper {
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  year: number;
  citationCount: number;
  source: 'semantic_scholar' | 'arxiv';
  paperId?: string;
}

/**
 * Search academic papers from multiple sources.
 */
export async function searchAcademic(
  query: string,
  max: number = 10
): Promise<AcademicPaper[]> {
  const results: AcademicPaper[] = [];

  // Run both searches in parallel
  const [ssResults, arxivResults] = await Promise.allSettled([
    searchSemanticScholar(query, Math.ceil(max / 2)),
    searchArXiv(query, Math.ceil(max / 2)),
  ]);

  if (ssResults.status === 'fulfilled') results.push(...ssResults.value);
  if (arxivResults.status === 'fulfilled') results.push(...arxivResults.value);

  // Deduplicate by title similarity
  const seen = new Set<string>();
  return results
    .filter(p => {
      const key = p.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, max);
}

/**
 * Semantic Scholar — free API, 100 requests/5min
 */
async function searchSemanticScholar(query: string, max: number): Promise<AcademicPaper[]> {
  try {
    const params = new URLSearchParams({
      query,
      limit: String(max),
      fields: 'title,authors,abstract,url,year,citationCount,externalIds',
    });

    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data.data || []).map((p: any) => ({
      title: p.title || '',
      authors: (p.authors || []).map((a: any) => a.name || ''),
      abstract: p.abstract || '',
      url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
      year: p.year || 0,
      citationCount: p.citationCount || 0,
      source: 'semantic_scholar' as const,
      paperId: p.paperId,
    }));
  } catch {
    return [];
  }
}

/**
 * ArXiv — free API, no limits (be nice: 3s between requests)
 */
async function searchArXiv(query: string, max: number): Promise<AcademicPaper[]> {
  try {
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      start: '0',
      max_results: String(max),
      sortBy: 'relevance',
      sortOrder: 'descending',
    });

    const res = await fetch(
      `http://export.arxiv.org/api/query?${params}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return [];
    const xml = await res.text();

    // Parse XML entries
    const entries = xml.split('<entry>').slice(1);
    return entries.map((entry): AcademicPaper => {
      const title = extractXMLTag(entry, 'title').replace(/\s+/g, ' ').trim();
      const abstract = extractXMLTag(entry, 'summary').replace(/\s+/g, ' ').trim();
      const url = extractXMLTag(entry, 'id');
      const published = extractXMLTag(entry, 'published');
      const year = published ? parseInt(published.slice(0, 4)) : 0;

      // Extract authors
      const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>\s*<\/author>/g);
      const authors = Array.from(authorMatches).map(m => m[1].trim());

      return {
        title,
        authors,
        abstract,
        url,
        year,
        citationCount: 0, // ArXiv doesn't provide this
        source: 'arxiv',
      };
    });
  } catch {
    return [];
  }
}

function extractXMLTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : '';
}

/**
 * Format academic papers for LLM prompt injection.
 */
export function formatAcademicResults(papers: AcademicPaper[]): string {
  if (!papers.length) return '';
  return papers.map((p, i) => {
    const authors = p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '');
    return `[Paper ${i + 1}] "${p.title}" (${p.year})\nAuthors: ${authors}\nCitations: ${p.citationCount}\nAbstract: ${p.abstract.slice(0, 300)}...\nURL: ${p.url}`;
  }).join('\n\n');
}
