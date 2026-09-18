import { NextRequest } from "next/server";
import { TokenError, authConfig, passwordGrant, storeTokens } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 무차별 대입 완화 — 진짜 방어선은 Keycloak realm의 brute force detection.
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || cur.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > MAX_ATTEMPTS;
}

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let cfg;
  try {
    cfg = authConfig();
  } catch {
    return fail(500, "서버 인증 설정이 누락되었습니다. 관리자에게 문의하세요.");
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "잘못된 요청입니다.");
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) return fail(400, "아이디와 비밀번호를 모두 입력하세요.");

  if (tooManyAttempts(clientKey(req))) {
    return fail(429, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.");
  }

  try {
    const tokens = await passwordGrant(cfg, username, password);
    await storeTokens(tokens);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof TokenError) {
      if (e.code === "invalid_grant") return fail(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
      if (e.code === "unauthorized_client") {
        console.error("[auth] Keycloak client에 Direct Access Grants가 비활성화되어 있습니다.");
        return fail(500, "인증 서버 설정 오류입니다. 관리자에게 문의하세요.");
      }
      console.error(`[auth] token endpoint ${e.status} ${e.code}`);
    }
    return fail(502, "인증 서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요.");
  }
}
