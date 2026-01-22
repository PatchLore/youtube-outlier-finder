// Force dynamic rendering to prevent any build-time prerender
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-md text-center px-6">
        <h1 className="text-4xl font-semibold tracking-tight mb-4">404</h1>
        <p className="text-lg text-zinc-300 mb-6">
          Page not found
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-xl bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200"
        >
          Go home →
        </a>
      </div>
    </div>
  );
}
