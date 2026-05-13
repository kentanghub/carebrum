import { NextRequest, NextResponse } from 'next/server';
import { addMonitoredTopic, removeMonitoredTopic, getMonitoredTopics, getTopicHistory, runScheduledChecks } from '@/lib/scheduler';

/**
 * GET /api/monitor — List monitored topics
 * POST /api/monitor — Add a topic to monitor
 * DELETE /api/monitor?id=xxx — Remove a monitored topic
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const topicId = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  if (action === 'check') {
    const results = await runScheduledChecks();
    return NextResponse.json({ checked: results.length, results });
  }

  if (topicId) {
    const topic = getTopicHistory(topicId);
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    return NextResponse.json(topic);
  }

  const topics = getMonitoredTopics();
  return NextResponse.json({ topics, count: topics.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.query || body.query.trim() === '') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const topic = addMonitoredTopic(body.query, body.intervalMinutes || 60);
    return NextResponse.json({ success: true, topic });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const topicId = url.searchParams.get('id');

  if (!topicId) {
    return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
  }

  const removed = removeMonitoredTopic(topicId);
  return NextResponse.json({ success: removed });
}
