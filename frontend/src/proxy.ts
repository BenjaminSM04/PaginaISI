import { NextRequest, NextResponse } from 'next/server';
import { apiInternalOrigin } from './lib/api-origin';

/** Preserve paths, query strings, cookies, Authorization and multipart bodies. */
export function proxy(request: NextRequest) {
  const destination = new URL(apiInternalOrigin());
  destination.pathname = request.nextUrl.pathname;
  destination.search = request.nextUrl.search;
  return NextResponse.rewrite(destination);
}

export const config = { matcher: ['/api/:path*', '/uploads/:path*'] };
