import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const source = await readFile(path.join(process.cwd(), 'scripts', 'amazon-sync.user.js'), 'utf8');

  return new NextResponse(source, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
