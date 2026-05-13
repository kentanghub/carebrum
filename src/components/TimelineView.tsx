'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, ExternalLink, ChevronRight } from 'lucide-react';

interface TimelineEvent {
  year: string;
  title: string;
  description: string;
  source?: string;
}

interface TimelineViewProps {
  report: string;
  query: string;
}

function extractTimelineEvents(report: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Match patterns like "2024:", "In 2024,", "Year 2024", "(2024)", etc.
  const yearRegex = /(?:^|\n).*?(?:(\d{4})\s*[-:–—]\s*(.+?)(?:\n|$)|(?:in|year|tahun)\s+(\d{4})\s*[-:,–—]\s*(.+?)(?:\n|$)|(\d{4})\s*[-:–—]\s*(.+?)(?:\n|$))/gi;

  let match;
  while ((match = yearRegex.exec(report)) !== null) {
    const year = match[1] || match[3] || match[5];
    const desc = (match[2] || match[4] || match[6] || '').trim();

    if (year && parseInt(year) >= 1900 && parseInt(year) <= 2030 && desc.length > 10) {
      events.push({
        year,
        title: desc.slice(0, 80),
        description: desc,
      });
    }
  }

  // Also extract from bullet points with dates
  const bulletRegex = /[-*]\s*.*?(\d{4})\s*[-:–—]\s*(.+?)(?:\n|$)/g;
  while ((match = bulletRegex.exec(report)) !== null) {
    const year = match[1];
    const desc = match[2]?.trim();
    if (year && desc && desc.length > 10 && !events.find(e => e.year === year && e.title === desc.slice(0, 80))) {
      events.push({ year, title: desc.slice(0, 80), description: desc });
    }
  }

  // Deduplicate and sort
  const seen = new Set<string>();
  return events
    .filter(e => {
      const key = `${e.year}-${e.title.slice(0, 30)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => parseInt(a.year) - parseInt(b.year));
}

export default function TimelineView({ report, query }: TimelineViewProps) {
  const events = useMemo(() => extractTimelineEvents(report), [report]);

  if (events.length < 2) {
    return (
      <div className="text-center py-8">
        <Clock className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-xs text-gray-500">Not enough chronological data for timeline</p>
        <p className="text-[10px] text-gray-600 mt-1">Try a query about history or events</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-green-400" />
        <h3 className="text-sm font-semibold text-gray-300">Timeline: {query.slice(0, 60)}</h3>
      </div>

      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500/40 via-green-500/20 to-transparent" />

        {events.map((event, i) => (
          <motion.div
            key={`${event.year}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative mb-4 last:mb-0"
          >
            {/* Dot */}
            <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-green-500/40 border-2 border-green-500/60" />

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-green-500/20 transition-all">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-green-400 font-bold">{event.year}</span>
                <ChevronRight className="w-3 h-3 text-gray-600" />
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">{event.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
