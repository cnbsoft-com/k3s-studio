import { NextRequest } from "next/server";
import { currentAccessToken } from "@/lib/auth";

// /api/*를 백엔드로 중계한다. 기존엔 middleware.ts의 rewrite가 이 역할을 했는데, 인증 토큰을
// 붙이려면(HttpOnly 쿠키는 미들웨어에서도 읽을 수 있지만 refresh 로직까지 넣으면 모든 요청이
// 느려진다) 라우트 핸들러로 옮기는 게 낫다 — cnb-investment와 동일 패턴.
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:9090";

// 백엔드도 이 경로들은 인증 없이 허용한다(SecurityConfig의 permitAll과 맞춰야 함) —
// 로그인 화면 자체가 번역(i18n)을 쓰므로 로그인 전에도 열려 있어야 한다.
const PUBLIC_PATHS = ["/api/i18n/"];

async function proxy(req: NextRequest): Promise<Response> {
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, BACKEND_URL);
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));

  const headers = new Headers();
  if (!isPublic) {
    const accessToken = await currentAccessToken();
    if (!accessToken) {
      return Response.json({ error: "unauthenticated" }, { status: 401 });
    }
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: "no-store",
    });
  } catch (e) {
    return Response.json({ error: "backend unreachable", backend: BACKEND_URL, detail: String(e) }, { status: 502 });
  }

  const body = await upstream.arrayBuffer();
  const out = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) out.set("content-type", upstreamType);
  return new Response(body, { status: upstream.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
