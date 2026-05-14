/**
 * In-Memory Knowledge Graph
 * 
 * Stores research findings as nodes and edges.
 * Persists across a session (server process lifetime).
 * Can be exported/imported for persistence.
 */

import { KnowledgeNode } from '@/types';

class KnowledgeGraphStore {
  private nodes: Map<string, KnowledgeNode> = new Map();

  /** Add or update a node */
  addNode(node: KnowledgeNode): void {
    const existing = this.nodes.get(node.id);
    if (existing) {
      // Merge connections
      const existingTargets = new Set(existing.connections.map(c => c.targetId));
      for (const conn of node.connections) {
        if (!existingTargets.has(conn.targetId)) {
          existing.connections.push(conn);
        }
      }
      // Merge properties
      Object.assign(existing.properties, node.properties);
    } else {
      this.nodes.set(node.id, { ...node, connections: [...node.connections] });
    }
  }

  /** Add a connection between two nodes */
  addEdge(sourceId: string, targetId: string, relation: string): void {
    const source = this.nodes.get(sourceId);
    if (source) {
      const existing = source.connections.find(c => c.targetId === targetId);
      if (!existing) {
        source.connections.push({ targetId, relation });
      }
    }
  }

  /** Get a node by ID */
  getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  /** Search nodes by label (fuzzy) */
  searchNodes(query: string, limit: number = 10): KnowledgeNode[] {
    const lower = query.toLowerCase();
    const results: Array<{ node: KnowledgeNode; score: number }> = [];

    for (const node of this.nodes.values()) {
      let score = 0;
      if (node.label.toLowerCase().includes(lower)) score += 10;
      if (node.properties['description']?.toLowerCase().includes(lower)) score += 5;
      if (node.type === 'finding') score += 2;

      if (score > 0) results.push({ node, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.node);
  }

  /** Get nodes from a specific session */
  getSessionNodes(sessionId: string): KnowledgeNode[] {
    return Array.from(this.nodes.values()).filter(n => n.sessionId === sessionId);
  }

  /** Get all nodes (for export) */
  getAllNodes(): KnowledgeNode[] {
    return Array.from(this.nodes.values());
  }

  /** Get connected nodes (BFS) */
  getConnectedNodes(nodeId: string, depth: number = 2): KnowledgeNode[] {
    const visited = new Set<string>();
    const result: KnowledgeNode[] = [];
    const queue: Array<{ id: string; level: number }> = [{ id: nodeId, level: 0 }];

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (visited.has(id) || level > depth) continue;
      visited.add(id);

      const node = this.nodes.get(id);
      if (node) {
        result.push(node);
        for (const conn of node.connections) {
          if (!visited.has(conn.targetId)) {
            queue.push({ id: conn.targetId, level: level + 1 });
          }
        }
      }
    }

    return result;
  }

  /** Get statistics */
  getStats(): { totalNodes: number; totalEdges: number; byType: Record<string, number>; bySession: Record<string, number> } {
    const byType: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    let totalEdges = 0;

    for (const node of this.nodes.values()) {
      byType[node.type] = (byType[node.type] || 0) + 1;
      bySession[node.sessionId] = (bySession[node.sessionId] || 0) + 1;
      totalEdges += node.connections.length;
    }

    return {
      totalNodes: this.nodes.size,
      totalEdges,
      byType,
      bySession,
    };
  }

  /** Clear all nodes */
  clear(): void {
    this.nodes.clear();
  }

  /** Export as JSON */
  export(): string {
    return JSON.stringify(Array.from(this.nodes.values()), null, 2);
  }

  /** Import from JSON */
  import(json: string): void {
    try {
      const nodes: KnowledgeNode[] = JSON.parse(json);
      for (const node of nodes) {
        this.nodes.set(node.id, node);
      }
    } catch (e) {
      console.error('[KnowledgeGraph] Failed to import:', e);
    }
  }
}

// Singleton instance (persists across requests in the same process)
export const knowledgeGraph = new KnowledgeGraphStore();

/**
 * Extract knowledge nodes from a research report.
 * Called after each research completion to build the knowledge graph.
 */
export function extractKnowledgeFromReport(
  report: string,
  query: string,
  sessionId: string
): KnowledgeNode[] {
  const nodes: KnowledgeNode[] = [];
  let nodeCounter = 0;

  // Extract concepts from headings
  const headingRegex = /#{2,3}\s+(.+?)(?:\n|$)/g;
  let match;
  while ((match = headingRegex.exec(report)) !== null) {
    const title = match[1].replace(/[📌📊✅📚💡🔍🎯⚖️🛡️🔧📖🏢🏛️⚙️🔬]/g, '').trim();
    if (title.length > 3 && title.length < 100) {
      nodes.push({
        id: `${sessionId}-concept-${nodeCounter++}`,
        label: title,
        type: 'concept',
        properties: { source: 'heading', query },
        connections: [],
        sessionId,
        timestamp: Date.now(),
      });
    }
  }

  // Extract entities (proper nouns, organizations)
  const entityRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  const seenEntities = new Set<string>();
  while ((match = entityRegex.exec(report)) !== null) {
    const entity = match[1];
    if (entity.length > 4 && !seenEntities.has(entity) && !/^(The|This|These|Those|What|When|Where|How|Why)/.test(entity)) {
      seenEntities.add(entity);
      nodes.push({
        id: `${sessionId}-entity-${nodeCounter++}`,
        label: entity,
        type: 'entity',
        properties: { query },
        connections: [],
        sessionId,
        timestamp: Date.now(),
      });
    }
  }

  // Extract key findings (bold text or bullet points with substance)
  const findingRegex = /[-*]\s+\*\*(.+?)\*\*[:\s]+(.+?)(?:\n|$)/g;
  while ((match = findingRegex.exec(report)) !== null) {
    const label = match[1].trim();
    const description = match[2].trim().slice(0, 200);
    if (label.length > 5 && description.length > 10) {
      nodes.push({
        id: `${sessionId}-finding-${nodeCounter++}`,
        label,
        type: 'finding',
        properties: { description, query },
        connections: [],
        sessionId,
        timestamp: Date.now(),
      });
    }
  }

  // Create connections between related nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      // Connect if labels share words
      const wordsA = new Set(a.label.toLowerCase().split(/\s+/));
      const wordsB = b.label.toLowerCase().split(/\s+/);
      const shared = wordsB.filter(w => wordsA.has(w) && w.length > 3);
      if (shared.length > 0) {
        a.connections.push({ targetId: b.id, relation: `related (${shared.join(', ')})` });
      }
    }
  }

  // Add to graph
  for (const node of nodes) {
    knowledgeGraph.addNode(node);
  }

  return nodes;
}
