import Link from "next/link";

const MESSAGES: Record<string, string> = {
  AccessDenied:
    "That account isn't allowed. Leo is restricted to a single user.",
  Configuration: "There's a problem with the sign-in configuration.",
  Verification: "The sign-in link is no longer valid.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    (error && MESSAGES[error]) || "Something went wrong signing in.";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Can&apos;t sign in
        </h1>
        <p className="text-sm text-slate-500">{message}</p>
        <Link
          href="/auth/signin"
          className="inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
