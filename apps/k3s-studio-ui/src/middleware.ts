import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:9090";
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, backendUrl);
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: "/api/:path*",
};
