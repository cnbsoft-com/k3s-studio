import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, REFRESH_COOKIE, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);

  const jar = await cookies();
  if (jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE)) redirect(next);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <h1 className="mb-6 text-center text-lg font-semibold">K3s-Studio 로그인</h1>
      <div className="rounded-lg border p-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
