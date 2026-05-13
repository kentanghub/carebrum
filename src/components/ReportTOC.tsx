'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { List, ChevronRight } from 'lucide-react';

interface TOCItem {
  id: string;
  title: string;
  level: number;
  children: TOCItem[];
}

interface ReportTOCProps {
  report: string;
  onNavigate?: (id: string) => void;
}

function extractTOC(report: string): TOCItem[] {
  const items: TOCItem[] = [];
  const lines = report.split('\n');

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    if (h2Match) {
      const title = h2Match[1].replace(/[📌📊✅📚💡🔍🎯]/g, '').trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      items.push({ id, title, level: 2, children: [] });
    } else if (h3Match && items.length > 0) {
      const title = h3Match[1].replace(/[0-9.]+\s*/g, '').trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      items[items.length - 1].children.push({ id, title, level: 3, children: [] });
    }
  }

  return items;
}

export default function ReportTOC({ report, onNavigate }: ReportTOCProps) {
  const toc = useMemo(() => extractTOC(report), [report]);

  if (toc.length < 2) return null;

  const handleClick = (id: string) => {
    // Try to scroll to the heading in the report
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    onNavigate?.(id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="mb-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <List className="w-3.5 h-3.5 text-gray-500" />
        <h3 className="text-[10px] text-gray-500 uppercase tracking-wider">Contents</h3>
      </div>
      <nav className="space-y-0.5">
        {toc.map((item, i) => (
          <div key={item.id}>
            <button
              onClick={() => handleClick(item.id)}
              className="group flex items-center gap-1.5 w-full text-left py-1 px-2 rounded-md text-xs text-gray-400 hover:text-green-400 hover:bg-white/[0.03] transition-all"
            >
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              <span className="truncate">{item.title}</span>
            </button>
            {item.children.map((child) => (
              <button
                key={child.id}
                onClick={() => handleClick(child.id)}
                className="group flex items-center gap-1.5 w-full text-left py-0.5 pl-6 pr-2 text-[11px] text-gray-500 hover:text-green-400 hover:bg-white/[0.02] transition-all truncate"
              >
                <span className="truncate">{child.title}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </motion.div>
  );
}
