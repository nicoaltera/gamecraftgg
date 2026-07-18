import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db().prepare('SELECT id, slug, prompt, status, brief, trace, cycles, verdict FROM generations WHERE id = ?').get(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
}
