import { cookies } from "next/headers";

// Keycloak 연동 — 로그인 화면은 앱이 직접 그리고, 자격증명은 서버 사이드에서 Keycloak 토큰
// 엔드포인트로 검증한다(Direct Access Grant, grant_type=password). cnb-investment와 같은
// cnb realm을 공유해 계정을 통합 관리한다.

export const ACCESS_COOKIE = "kc_at";
export const REFRESH_COOKIE = "kc_rt";
export const EXPIRES_COOKIE = "kc_exp";

export type AuthConfig = {
  issuer: string;
  clientId: string;
  baseUrl: string;
};

export function authConfig(): AuthConfig {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const baseUrl = process.env.APP_BASE_URL;
  if (!issuer || !clientId || !baseUrl) {
    throw new Error("인증 설정 누락: KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, APP_BASE_URL이 모두 필요합니다.");
  }
  return { issuer, clientId, baseUrl: baseUrl.replace(/\/$/, "") };
}

export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.APP_BASE_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: maxAgeSec,
  };
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export class TokenError extends Error {
  constructor(readonly status: number, readonly code: string, readonly description?: string) {
    super(`${code}${description ? `: ${description}` : ""}`);
    this.name = "TokenError";
  }
}

async function tokenRequest(cfg: AuthConfig, body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${cfg.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    let description: string | undefined;
    try {
      const j = (await res.json()) as { error?: string; error_description?: string };
      if (j.error) code = j.error;
      description = j.error_description;
    } catch {
      /* 본문이 JSON이 아니면 상태 코드만 사용 */
    }
    throw new TokenError(res.status, code, description);
  }
  return (await res.json()) as TokenResponse;
}

export async function passwordGrant(cfg: AuthConfig, username: string, password: string): Promise<TokenResponse> {
  return tokenRequest(
    cfg,
    new URLSearchParams({
      grant_type: "password",
      client_id: cfg.clientId,
      scope: "openid profile email",
      username,
      password,
    }),
  );
}

export async function refreshTokens(cfg: AuthConfig, refreshToken: string): Promise<TokenResponse> {
  return tokenRequest(
    cfg,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      refresh_token: refreshToken,
    }),
  );
}

export async function endSession(cfg: AuthConfig, refreshToken: string): Promise<void> {
  try {
    await fetch(`${cfg.issuer}/protocol/openid-connect/logout`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, refresh_token: refreshToken }),
      cache: "no-store",
    });
  } catch {
    /* Keycloak 세션은 만료로 정리된다 */
  }
}

/** 만료 임박(30초 여유)이면 refresh, 그것도 실패하면 null(호출부가 401 처리). */
export async function currentAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  const expiresAt = Number(jar.get(EXPIRES_COOKIE)?.value ?? 0);

  if (access && expiresAt > Date.now() + 30_000) return access;
  if (!refresh) return null;

  try {
    const cfg = authConfig();
    const t = await refreshTokens(cfg, refresh);
    await storeTokens(t);
    return t.access_token;
  } catch {
    return null;
  }
}

export async function storeTokens(t: TokenResponse): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, t.access_token, cookieOptions(t.expires_in));
  if (t.refresh_token) {
    jar.set(REFRESH_COOKIE, t.refresh_token, cookieOptions(60 * 60 * 24 * 30));
  }
  jar.set(EXPIRES_COOKIE, String(Date.now() + t.expires_in * 1000), cookieOptions(t.expires_in));
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, EXPIRES_COOKIE]) {
    jar.set(name, "", { ...cookieOptions(0), maxAge: 0 });
  }
}

export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
