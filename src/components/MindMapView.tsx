'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Network, Download, Maximize2, Minimize2 } from 'lucide-react';

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
      title: match[1].replace(/[📌📊✅📚💡🔍🎯]/g, '').trim(),
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
        label: h3Match[1].replace(/[0-9.]+/g, '').trim().slice(0, 50),
        children: [],
      });
    }

    // Extract bullet points as leaf nodes (if no H3)
    if (node.children.length === 0) {
      const bulletRegex = /[-*]\s+(.+?)(?:\n|$)/g;
      let bulletMatch;
      let count = 0;
      while ((bulletMatch = bulletRegex.exec(sectionText)) !== null && count < 6) {
        const text = bulletMatch[1].trim().slice(0, 60);
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

function MindMapSVG({ root, expanded }: { root: MindMapNode; expanded: boolean }) {
  const branchCount = root.children.length;

  // Dynamic sizing based on content
  const baseRadius = expanded ? 200 : 150;
  const subRadius = expanded ? 90 : 60;
  const centerX = expanded ? 500 : 400;
  const centerY = expanded ? 400 : 250;

  // Calculate dynamic viewBox height
  const maxSubChildren = Math.max(...root.children.map(c => c.children.length), 0);
  const viewWidth = expanded ? 1000 : 800;
  const viewHeight = expanded
    ? Math.max(800, centerY + baseRadius + subRadius + 100)
    : Math.max(500, centerY + baseRadius + subRadius + 80);

  const mainNodes = root.children.map((child, i) => {
    const angle = (i / branchCount) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * baseRadius;
    const y = centerY + Math.sin(angle) * baseRadius;
    return { ...child, x, y, angle };
  });

  return (
    <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* Background gradient */}
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(34, 197, 94, 0.15)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx={centerX} cy={centerY} r={baseRadius + 50} fill="url(#centerGlow)" />

      {/* Central node */}
      <circle cx={centerX} cy={centerY} r={35} fill="rgba(34, 197, 94, 0.2)" stroke="rgba(34, 197, 94, 0.6)" strokeWidth={2} />
      <text x={centerX} y={centerY - 4} textAnchor="middle" fill="#4ade80" fontSize={expanded ? 11 : 9} fontWeight="bold">
        {root.label.slice(0, 25)}
      </text>
      <text x={centerX} y={centerY + 10} textAnchor="middle" fill="#86efac" fontSize={7} opacity={0.7}>
        {branchCount} topics
      </text>

      {/* Main branches */}
      {mainNodes.map((node, i) => (
        <g key={node.id}>
          {/* Animated line to center */}
          <line x1={centerX} y1={centerY} x2={node.x} y2={node.y}
            stroke="rgba(34, 197, 94, 0.3)" strokeWidth={1.5}
            strokeDasharray="4,4" />

          {/* Node circle */}
          <circle cx={node.x} cy={node.y} r={expanded ? 28 : 22}
            fill="rgba(34, 197, 94, 0.1)" stroke="rgba(34, 197, 94, 0.4)" strokeWidth={1.5} />
          <text x={node.x} y={node.y + 4} textAnchor="middle" fill="#86efac"
            fontSize={expanded ? 8 : 7}>
            {node.label.slice(0, expanded ? 20 : 15)}
          </text>

          {/* Sub-branches */}
          {node.children.slice(0, expanded ? 8 : 5).map((child, j) => {
            const spread = expanded ? 0.5 : 0.4;
            const subAngle = node.angle + (j - (node.children.length - 1) / 2) * spread;
            const subX = node.x + Math.cos(subAngle) * subRadius;
            const subY = node.y + Math.sin(subAngle) * subRadius;

            // Keep within viewBox
            const clampedX = Math.max(30, Math.min(viewWidth - 30, subX));
            const clampedY = Math.max(30, Math.min(viewHeight - 30, subY));

            return (
              <g key={child.id}>
                <line x1={node.x} y1={node.y} x2={clampedX} y2={clampedY}
                  stroke="rgba(34, 197, 94, 0.15)" strokeWidth={1} />
                <circle cx={clampedX} cy={clampedY} r={expanded ? 10 : 8}
                  fill="rgba(34, 197, 94, 0.05)" stroke="rgba(34, 197, 94, 0.2)" strokeWidth={1} />
                <text x={clampedX} y={clampedY + 3} textAnchor="middle" fill="#6ee7b7"
                  fontSize={expanded ? 7 : 6}>
                  {child.label.slice(0, expanded ? 18 : 12)}
                </text>
              </g>
            );
          })}

          {/* Show count if more children hidden */}
          {node.children.length > (expanded ? 8 : 5) && (() => {
            const overflowAngle = node.angle + 0.6;
            const ox = node.x + Math.cos(overflowAngle) * (subRadius + 20);
            const oy = node.y + Math.sin(overflowAngle) * (subRadius + 20);
            return (
              <text x={ox} y={oy} textAnchor="middle" fill="#4ade80" fontSize={6} opacity={0.6}>
                +{node.children.length - (expanded ? 8 : 5)} more
              </text>
            );
          })()}
        </g>
      ))}

      {/* Legend */}
      <g transform={`translate(10, ${viewHeight - 30})`}>
        <circle cx={6} cy={6} r={4} fill="rgba(34, 197, 94, 0.2)" stroke="rgba(34, 197, 94, 0.4)" />
        <text x={16} y={9} fill="#6b7280" fontSize={7}>Main topic</text>
        <circle cx={90} cy={6} r={3} fill="rgba(34, 197, 94, 0.05)" stroke="rgba(34, 197, 94, 0.2)" />
        <text x={99} y={9} fill="#6b7280" fontSize={7}>Sub-topic</text>
      </g>
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
        <p className="text-[10px] text-gray-600 mt-1">Try a research with headings (## and ###)</p>
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
    a.download = `cerebrum-mindmap-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-semibold text-gray-300">Mind Map</h3>
          <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.04]">
            {root.children.length} branches
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-green-400 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] transition-colors min-h-[44px]">
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {expanded ? 'Compact' : 'Expand'}
          </button>
          <button onClick={exportSVG}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-green-400 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] transition-colors min-h-[44px]">
            <Download className="w-3 h-3" /> SVG
          </button>
        </div>
      </div>

      <motion.div
        id="mindmap-svg"
        className={`rounded-lg bg-white/[0.01] border border-white/[0.04] p-2 overflow-auto custom-scrollbar ${
          expanded ? 'max-h-none' : 'max-h-[500px]'
        }`}
        animate={{ height: expanded ? 'auto' : 500 }}
        transition={{ duration: 0.3 }}
      >
        <MindMapSVG root={root} expanded={expanded} />
      </motion.div>

      {/* Sub-topic list for accessibility */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {root.children.map((branch, i) => (
          <div key={branch.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.02] border border-white/[0.03]">
            <span className="w-2 h-2 rounded-full bg-green-500/30 flex-shrink-0" />
            <span className="text-[10px] text-gray-400 truncate">{branch.label}</span>
            {branch.children.length > 0 && (
              <span className="text-[9px] text-gray-600 ml-auto">{branch.children.length}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
