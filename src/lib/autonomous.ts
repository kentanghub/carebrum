/**
 * Autonomous Research Engine
 * 
 * Runs extended research sessions that can last 10-30 minutes.
 * Breaks a complex query into sub-questions, researches each independently,
 * then synthesizes all findings into a comprehensive report.
 * 
 * Features:
 * - Automatic sub-question generation
 * - Sequential deep research on each sub-topic
 * - Progress tracking with estimated time
 * - Resumable sessions (via session ID)
 * - Periodic status updates
 */

import { AgentMessage, StreamEvent, ResearchRequest } from '@/types';
import { completion } from './llm-client';
import { searchWeb, crawlPages, formatSearchResults } from './search';
import { searchAcademic, formatAcademicResults } from './academic';

interface AutonomousConfig {
  query: string;
  depth: 'quick' | 'standard' | 'deep' | 'academic';
  maxSubQuestions: number;
  maxTimeMinutes: number;
  onProgress?: (event: StreamEvent) => void;
}

interface SubResearch {
  question: string;
  answer: string;
  sources: any[];
  status: 'pending' | 'running' | 'completed' | 'error';
}

/**
 * Generate sub-questions from a main research query.
 */
async function generateSubQuestions(query: string, depth: string): Promise<string[]> {
  const maxQ = depth === 'deep' ? 7 : depth === 'standard' ? 5 : 3;

  const msgs: AgentMessage[] = [
    { role: 'system', content: 'You are a research planning expert. Break complex questions into focused sub-questions.' },
    { role: 'user', content: `Break this research query into ${maxQ} focused sub-questions that together will provide a comprehensive answer:

QUERY: ${query}

Rules:
- Each sub-question should be specific and researchable
- Together they should cover the topic comprehensively
- Order from foundational to advanced
- Include both factual and analytical questions
- Answer in the SAME LANGUAGE as the query

Output ONLY the sub-questions, one per line, numbered 1-${maxQ}.` },
  ];

  try {
    const result = await completion(msgs, { temperature: 0.4, max_tokens: 500, preferFree: true });
    const questions = result.split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(l => l.length > 10 && l.length < 200 && !l.startsWith('Here') && !l.startsWith('Below'))
      .slice(0, maxQ);

    return questions.length > 0 ? questions : [query];
  } catch {
    return [query];
  }
}

/**
 * Research a single sub-question deeply.
 */
async function researchSubQuestion(
  question: string,
  index: number,
  total: number,
  parentQuery: string
): Promise<SubResearch> {
  const sub: SubResearch = { question, answer: '', sources: [], status: 'running' };

  try {
    // Search
    const results = await searchWeb(question, 5);
    sub.sources = results;

    // Crawl top pages
    const topUrls = results.filter(r => r.url).slice(0, 2).map(r => r.url);
    let pageContents = '';
    if (topUrls.length > 0) {
      const crawled = await crawlPages(topUrls, 2000, 2);
      pageContents = Array.from(crawled.values()).join('\n\n');
    }

    // Synthesize answer
    const msgs: AgentMessage[] = [
      { role: 'system', content: 'You are a research analyst. Provide a thorough, well-sourced answer.' },
      { role: 'user', content: `SUB-QUESTION ${index + 1}/${total} of: "${parentQuery}"

QUESTION: ${question}

${results.length > 0 ? `SEARCH RESULTS:\n${formatSearchResults(results)}` : ''}
${pageContents ? `\nPAGE CONTENT:\n${pageContents.slice(0, 2000)}` : ''}

Provide a comprehensive answer with:
1. Direct answer to the question
2. Supporting evidence and data
3. Different perspectives if they exist
4. Source citations by title

Answer in the SAME LANGUAGE as the question. Be thorough (300-800 words).` },
    ];

    sub.answer = await completion(msgs, { temperature: 0.4, max_tokens: 1500, preferFree: true });
    sub.status = 'completed';
  } catch (e) {
    sub.answer = `Error: ${e instanceof Error ? e.message : 'Research failed'}`;
    sub.status = 'error';
  }

  return sub;
}

/**
 * Synthesize all sub-research into a final comprehensive report.
 */
async function synthesizeAutonomousReport(
  query: string,
  subResearches: SubResearch[],
  depth: string
): Promise<string> {
  const findings = subResearches
    .filter(s => s.status === 'completed')
    .map((s, i) => `### Sub-Question ${i + 1}: ${s.question}\n\n${s.answer}`)
    .join('\n\n---\n\n');

  const allSources = subResearches.flatMap(s => s.sources);
  const sourceList = allSources.slice(0, 15).map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n');

  const msgs: AgentMessage[] = [
    { role: 'system', content: `You are a senior research report writer. Create a publication-quality report.

Use this structure:
## 📌 Executive Summary
## 📊 Key Findings & Data
## 🔍 Deep Analysis (with sub-sections for each theme)
## 💡 Implications & Outlook
## ⚖️ Limitations & Caveats
## ✅ Conclusion
## 📚 References` },
    { role: 'user', content: `ORIGINAL QUERY: ${query}

RESEARCH FINDINGS FROM ${subResearches.length} SUB-TOPICS:

${findings}

${sourceList ? `\nALL SOURCES:\n${sourceList}` : ''}

Synthesize ALL findings into one cohesive, comprehensive report.
- Connect findings across sub-topics
- Identify overarching themes and patterns
- Highlight contradictions between sources
- Provide a nuanced conclusion
- Cite sources throughout

This is a DEPTH="${depth}" report — ${depth === 'deep' ? 'be extremely thorough, 2000+ words' : depth === 'quick' ? 'be concise but complete, 500-800 words' : 'be balanced, 1000-1500 words'}.
Answer in the SAME LANGUAGE as the query.` },
  ];

  return completion(msgs, { temperature: 0.5, max_tokens: 4000 });
}

/**
 * Run autonomous research pipeline.
 * This is the main entry point for extended research sessions.
 */
export async function* runAutonomousResearch(config: AutonomousConfig): AsyncGenerator<StreamEvent> {
  const { query, depth, maxSubQuestions, maxTimeMinutes } = config;
  const t0 = Date.now();
  const maxTimeMs = maxTimeMinutes * 60 * 1000;

  try {
    // Phase 1: Generate sub-questions
    yield { type: 'progress', step: 0, message: 'Generating research plan...', progress: 5 };
    yield { type: 'agent_start', agentId: 'orchestrator', message: 'Planning autonomous research...' };

    const subQuestions = await generateSubQuestions(query, depth);
    yield { type: 'agent_complete', agentId: 'orchestrator', data: `Generated ${subQuestions.length} sub-questions` };
    yield { type: 'progress', step: 0, message: `Researching ${subQuestions.length} sub-topics...`, progress: 10 };

    // Phase 2: Research each sub-question
    const subResearches: SubResearch[] = [];
    for (let i = 0; i < subQuestions.length; i++) {
      // Check time limit
      if (Date.now() - t0 > maxTimeMs) {
        yield { type: 'progress', step: 2, message: `Time limit reached, synthesizing with ${i}/${subQuestions.length} sub-topics...`, progress: 70 };
        break;
      }

      const progress = 10 + ((i / subQuestions.length) * 60);
      yield { type: 'progress', step: 1, message: `Researching: ${subQuestions[i].slice(0, 60)}...`, progress: Math.round(progress) };
      yield { type: 'agent_start', agentId: 'multimodal_extractor', message: `Sub-topic ${i + 1}/${subQuestions.length}` };

      const result = await researchSubQuestion(subQuestions[i], i, subQuestions.length, query);
      subResearches.push(result);

      yield { type: 'agent_complete', agentId: 'multimodal_extractor', data: result.answer.slice(0, 200) };
      yield { type: 'sources', data: result.sources.map(s => ({ title: s.title, snippet: s.snippet, url: s.url, source: s.source || 'web' })) };
    }

    // Phase 3: Synthesize final report
    yield { type: 'progress', step: 3, message: 'Synthesizing comprehensive report...', progress: 75 };
    yield { type: 'agent_start', agentId: 'synthesizer', message: 'Writing final autonomous report...' };

    const finalReport = await synthesizeAutonomousReport(query, subResearches, depth);

    yield { type: 'agent_complete', agentId: 'synthesizer', data: finalReport };
    yield { type: 'report', data: finalReport };
    yield { type: 'followup_ready', data: { query, hasHistory: true } };
    yield { type: 'progress', step: 4, message: 'Autonomous research complete!', progress: 100 };

    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`[Auto] ✓ ${elapsed}s | ${subResearches.length} sub-topics | ${finalReport.length}c`);

  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error('[Auto] ✗', m);
    yield { type: 'error', message: m };
  }
}
