'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Network, Download, Maximize2 } from 'lucide-react';

interface MindMapNode {
  id: string;
  label: string;
  children: MindMapNode[];
}

interface MindMapViewProps {
  report: string;
  query: string;
}

function parseReportToMindMap(report: string, query: string): MindMapNode {
  const root: MindMapNode = { id: 'root', label: query.slice(0, 50), children: [] };

  // Extract H2 headings as main branches
  const h2Regex = /##\s+(.+?)(?:\n|$)/g;
  let match;
  const sections: { title: string; start: number; end: number }[] = [];

  while ((match = h2Regex.exec(report)) !== null) {
    sections.push({
      title: match[1].replace(/[📌📊✅📚💡🔍]/g, '').trim(),
      start: match.index + match[0].length,
      end: 0,
    });
  }

  // Set end positions
  for (let i = 0; i < sections.length; i++) {
    sections[i].end = i < sections.length - 1 ? sections[i + 1].start : report.length;
  }

  for (const section of sections) {
    const sectionText = report.slice(section.start, section.end);
    const node: MindMapNode = {
      id: `s-${section.title.slice(0, 20).replace(/\s/g, '-')}`,
      label: section.title,
      children: [],
    };

    // Extract H3 headings as sub-branches
    const h3Regex = /###\s+(.+?)(?:\n|$)/g;
    let h3Match;
    while ((h3Match = h3Regex.exec(sectionText)) !== null) {
      node.children.push({
        id: `h3-${h3Match[1].slice(0, 20).replace(/\s/g, '-')}`,
        label: h3Match[1].replace(/[0-9.]+/g, '').trim().slice(0, 40),
        children: [],
      });
    }

    // Extract bullet points as leaf nodes (if no H3)
    if (node.children.length === 0) {
      const bulletRegex = /[-*]\s+(.+?)(?:\n|$)/g;
      let bulletMatch;
      let count = 0;
      while ((bulletMatch = bulletRegex.exec(sectionText)) !== null && count < 5) {
        const text = bulletMatch[1].trim().slice(0, 50);
        if (text.length > 5) {
          node.children.push({
            id: `b-${count}`,
            label: text,
            children: [],
          });
          count++;
        }
      }
    }

    if (node.children.length > 0) {
      root.children.push(node);
    }
  }

  return root;
}

function MindMapSVG({ root }: { root: MindMapNode }) {
  const centerX = 400;
  const centerY = 200;
  const radius = 150;

  const mainNodes = root.children.map((child, i) => {
    const angle = (i / root.children.length) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    return { ...child, x, y, angle };
  });

  return (
    <svg viewBox="0 0 800 400" className="w-full h-auto">
      {/* Central node */}
      <circle cx={centerX} cy={centerY} r={30} fill="rgba(34, 197, 94, 0.2)" stroke="rgba(34, 197, 94, 0.6)" strokeWidth={2} />
      <text x={centerX} y={centerY + 4} textAnchor="middle" fill="#4ade80" fontSize={10} fontWeight="bold">
        {root.label.slice(0, 20)}
      </text>

      {/* Main branches */}
      {mainNodes.map((node, i) => (
        <g key={node.id}>
          {/* Line to center */}
          <line x1={centerX} y1={centerY} x2={node.x} y2={node.y} stroke="rgba(34, 197, 94, 0.3)" strokeWidth={1.5} />

          {/* Node circle */}
          <circle cx={node.x} cy={node.y} r={20} fill="rgba(34, 197, 94, 0.1)" stroke="rgba(34, 197, 94, 0.4)" strokeWidth={1.5} />
          <text x={node.x} y={node.y + 4} textAnchor="middle" fill="#86efac" fontSize={8}>
            {node.label.slice(0, 15)}
          </text>

          {/* Sub-branches */}
          {node.children.slice(0, 4).map((child, j) => {
            const subAngle = node.angle + (j - 1) * 0.4;
            const subX = node.x + Math.cos(subAngle) * 60;
            const subY = node.y + Math.sin(subAngle) * 60;
            return (
              <g key={child.id}>
                <line x1={node.x} y1={node.y} x2={subX} y2={subY} stroke="rgba(34, 197, 94, 0.15)" strokeWidth={1} />
                <circle cx={subX} cy={subY} r={8} fill="rgba(34, 197, 94, 0.05)" stroke="rgba(34, 197, 94, 0.2)" strokeWidth={1} />
                <text x={subX} y={subY + 3} textAnchor="middle" fill="#6ee7b7" fontSize={6}>
                  {child.label.slice(0, 12)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

export default function MindMapView({ report, query }: MindMapViewProps) {
  const root = useMemo(() => parseReportToMindMap(report, query), [report, query]);
  const [expanded, setExpanded] = useState(false);

  if (root.children.length === 0) {
    return (
      <div className="text-center py-8">
        <Network className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-xs text-gray-500">Not enough structure for mind map</p>
      </div>
    );
  }

  const exportSVG = () => {
    const svgEl = document.querySelector('#mindmap-svg svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carebrum-mindmap-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-semibold text-gray-300">Mind Map</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-gray-400 hover:text-green-400 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
            <Maximize2 className="w-3 h-3" />
          </button>
          <button onClick={exportSVG}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-green-400 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
            <Download className="w-3 h-3" /> SVG
          </button>
        </div>
      </div>

      <motion.div
        id="mindmap-svg"
        className={`rounded-lg bg-white/[0.01] border border-white/[0.04] p-2 overflow-hidden ${expanded ? 'max-h-none' : 'max-h-[300px]'}`}
        animate={{ height: expanded ? 'auto' : 300 }}
      >
        <MindMapSVG root={root} />
      </motion.div>
    </div>
  );
}
