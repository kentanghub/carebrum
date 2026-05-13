import { NextRequest, NextResponse } from 'next/server';
import { runAutonomousResearch } from '@/lib/autonomous';

/**
 * Autonomous Research API — POST /api/autonomous
 * 
 * Runs extended research sessions (10-30 min) with automatic sub-question generation.
 * 
 * Body: { query: string, depth?: 'quick'|'standard'|'deep', maxSubQuestions?: number, maxTimeMinutes?: number }
 * Returns: SSE stream
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.query || body.query.trim() === '') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of runAutonomousResearch({
            query: body.query,
            depth: body.depth || 'deep',
            maxSubQuestions: body.maxSubQuestions || 5,
            maxTimeMinutes: body.maxTimeMinutes || 15,
          })) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
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
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Cerebrum Autonomous Research API',
    description: 'Extended research sessions with automatic sub-question generation',
    usage: {
      method: 'POST',
      body: {
        query: 'string (required)',
        depth: "'quick' | 'standard' | 'deep' (default: 'deep')",
        maxSubQuestions: 'number (default: 5)',
        maxTimeMinutes: 'number (default: 15)',
      },
    },
  });
}
