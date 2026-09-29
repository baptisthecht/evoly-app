import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="h-16 border-b border-gray-200 bg-white flex items-center px-6">
        <span className="text-xl font-bold text-violet-600 tracking-tight">
          evoly
        </span>
      </header>
      <main className="flex items-start justify-center py-12 px-4">
        <div className="w-full max-w-lg">
          {children}
        </div>
      </main>
    </div>
  );
}
