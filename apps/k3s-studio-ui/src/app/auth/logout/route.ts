import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, EXPIRES_COOKIE, REFRESH_COOKIE, authConfig, cookieOptions, endSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Location은 상대 경로로 직접 만든다 — 리버스 프록시 뒤에서 라우트 핸들러의 req.url이
// 컨테이너 내부 주소로 잡혀 브라우저가 접근 못 하는 Location을 만들어내는 문제가 있다
// (cnb-investment에서 실측 확인된 함정 — NextResponse.redirect(new URL(path, req.url)) 금지).
export async function GET(req: NextRequest) {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    try {
      await endSession(authConfig(), refresh);
    } catch {
      /* 설정 누락이어도 로컬 쿠키는 지운다 */
    }
  }

  const res = new NextResponse(null, { status: 303, headers: { location: "/login" } });
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, EXPIRES_COOKIE]) {
    res.cookies.set(name, "", { ...cookieOptions(0), maxAge: 0 });
  }
  return res;
}
