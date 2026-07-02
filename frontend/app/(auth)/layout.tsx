// Centered card layout for the public auth pages (login / register).
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            AutoRestTest
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            AI-powered REST API testing
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
