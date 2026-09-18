import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";

// 인증 게이트 — 페이지 라우트만 본다. /api/*는 손대지 않는다 — app/api/[...path]/route.ts가
// Bearer 토큰 부착과 공개 경로(i18n) 예외를 전부 자체 처리한다(여기서 또 401을 주면 로그인
// 화면의 번역 요청까지 막혀버림).
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(ACCESS_COOKIE) || req.cookies.has(REFRESH_COOKIE);
  if (hasSession) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/|login$|auth/|_next/static|_next/image|favicon.ico).*)"],
};
