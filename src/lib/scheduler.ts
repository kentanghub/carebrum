/**
 * Research Scheduler
 * 
 * Monitors topics over time by scheduling recurring research checks.
 * Stores recent findings and detects significant changes.
 * 
 * In-memory implementation — for production, use a database + cron service.
 */

import { completion } from './llm-client';
import { searchWeb, formatSearchResults } from './search';
import { AgentMessage } from '@/types';

interface MonitoredTopic {
  id: string;
  query: string;
  intervalMinutes: number;
  lastChecked: number;
  lastReport: string;
  lastSources: any[];
  findings: Array<{ timestamp: number; summary: string; sources: number }>;
  active: boolean;
}

const monitoredTopics = new Map<string, MonitoredTopic>();

/**
 * Add a topic to monitor.
 */
export function addMonitoredTopic(query: string, intervalMinutes: number = 60): MonitoredTopic {
  const id = `topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const topic: MonitoredTopic = {
    id,
    query,
    intervalMinutes,
    lastChecked: 0,
    lastReport: '',
    lastSources: [],
    findings: [],
    active: true,
  };
  monitoredTopics.set(id, topic);
  return topic;
}

/**
 * Remove a monitored topic.
 */
export function removeMonitoredTopic(id: string): boolean {
  return monitoredTopics.delete(id);
}

/**
 * Get all monitored topics.
 */
export function getMonitoredTopics(): MonitoredTopic[] {
  return Array.from(monitoredTopics.values());
}

/**
 * Check a single topic for new findings.
 */
async function checkTopic(topic: MonitoredTopic): Promise<{ hasChanges: boolean; summary: string }> {
  try {
    // Search for recent results
    const results = await searchWeb(`${topic.query} latest news`, 5);
    const searchText = formatSearchResults(results);

    if (!searchText) {
      return { hasChanges: false, summary: 'No new results found' };
    }

    // Compare with previous findings
    const msgs: AgentMessage[] = [
      { role: 'system', content: 'You are a change detection analyst. Compare new search results with previous findings and identify significant changes.' },
      { role: 'user', content: `TOPIC: ${topic.query}

PREVIOUS FINDINGS:
${topic.lastReport ? topic.lastReport.slice(0, 1000) : 'No previous findings.'}

NEW SEARCH RESULTS:
${searchText}

Analyze:
1. Are there any NEW developments not in previous findings?
2. Any significant CHANGES to previously known information?
3. Rate the significance: HIGH (major development), MEDIUM (notable update), LOW (minor/no change)

Output format:
CHANGES: YES/NO
SIGNIFICANCE: HIGH/MEDIUM/LOW
SUMMARY: [2-3 sentence summary of what changed]` },
    ];

    const analysis = await completion(msgs, { temperature: 0.3, max_tokens: 300, preferFree: true });

    const hasChanges = analysis.includes('CHANGES: YES');
    const significance = analysis.includes('SIGNIFICANCE: HIGH') ? 'high' : analysis.includes('SIGNIFICANCE: MEDIUM') ? 'medium' : 'low';
    const summaryMatch = analysis.match(/SUMMARY:\s*([\s\S]+)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : analysis.slice(0, 200);

    // Update topic
    topic.lastChecked = Date.now();
    topic.findings.push({
      timestamp: Date.now(),
      summary: summary.slice(0, 500),
      sources: results.length,
    });

    // Keep only last 50 findings
    if (topic.findings.length > 50) {
      topic.findings = topic.findings.slice(-50);
    }

    if (hasChanges) {
      topic.lastReport = summary;
      topic.lastSources = results;
    }

    return { hasChanges, summary: `[${significance.toUpperCase()}] ${summary}` };
  } catch (e) {
    return { hasChanges: false, summary: `Check failed: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/**
 * Run all due topic checks.
 * Called periodically (e.g., every minute) by the scheduler.
 */
export async function runScheduledChecks(): Promise<Array<{ topicId: string; query: string; result: { hasChanges: boolean; summary: string } }>> {
  const now = Date.now();
  const results: Array<{ topicId: string; query: string; result: { hasChanges: boolean; summary: string } }> = [];

  for (const topic of monitoredTopics.values()) {
    if (!topic.active) continue;

    const elapsed = now - topic.lastChecked;
    const intervalMs = topic.intervalMinutes * 60 * 1000;

    if (elapsed >= intervalMs) {
      const result = await checkTopic(topic);
      results.push({ topicId: topic.id, query: topic.query, result });
    }
  }

  return results;
}

/**
 * Get topic history (findings over time).
 */
export function getTopicHistory(id: string): MonitoredTopic | undefined {
  return monitoredTopics.get(id);
}
