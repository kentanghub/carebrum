import { NextRequest, NextResponse } from 'next/server';
import { runResearchPipeline, initializeAgents } from '@/lib/agents';
import { ResearchRequest } from '@/types';

/**
 * Developer API — POST /api/v1/research
 *
 * Accepts JSON body:
 *   { query: string, depth?: 'quick'|'standard'|'deep', mode?: 'research'|'followup', history?: Message[] }
 *
 * Returns: SSE stream with events
 *
 * Usage:
 *   curl -X POST https://carebrum.vercel.app/api/v1/research \
 *     -H "Content-Type: application/json" \
 *     -d '{"query": "Impact of AI on healthcare", "depth": "standard"}'
 *
 * For non-streaming JSON response, add ?format=json
 */
export async function POST(req: NextRequest) {
  try {
    const body: ResearchRequest = await req.json();

    if (!body.query || body.query.trim() === '') {
      return NextResponse.json(
        { error: 'Query is required', usage: 'POST { "query": "your question" }' },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const format = url.searchParams.get('format');

    // JSON mode (non-streaming)
    if (format === 'json') {
      const agents = initializeAgents();
      let report = '';
      let sources: any[] = [];

      for await (const event of runResearchPipeline(body, agents)) {
        if (event.type === 'report') report = event.data || '';
        if (event.type === 'sources') sources = event.data || [];
      }

      return NextResponse.json({
        success: true,
        query: body.query,
        depth: body.depth || 'standard',
        report,
        sources,
        agents: agents.map(a => ({
          id: a.id,
          name: a.name,
          status: a.status,
          output: a.output?.slice(0, 200),
        })),
      });
    }

    // SSE streaming mode (default)
    const agents = initializeAgents();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of runResearchPipeline(body, agents)) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Stream error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    name: 'Cerebrum Research API',
    version: '1.0.0',
    description: 'Multi-Agent Research System — AI-powered research with web search',
    endpoints: {
      'POST /api/v1/research': {
        description: 'Run a research query',
        body: {
          query: 'string (required) — Your research question',
          depth: "'quick' | 'standard' | 'deep' (optional, default: 'standard')",
          mode: "'research' | 'followup' (optional)",
          history: 'Message[] (optional) — Previous conversation for follow-up',
        },
        query_params: {
          format: "'json' for non-streaming JSON response, omit for SSE stream",
        },
        examples: {
          streaming: "curl -X POST /api/v1/research -H 'Content-Type: application/json' -d '{\"query\": \"AI in healthcare\"}'",
          json: "curl -X POST '/api/v1/research?format=json' -H 'Content-Type: application/json' -d '{\"query\": \"AI in healthcare\"}'",
        },
      },
    },
  });
}
