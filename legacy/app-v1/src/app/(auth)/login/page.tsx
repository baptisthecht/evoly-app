import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Connexion — Evoly",
};

export default function LoginPage() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        Connexion
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Pas encore de compte ?{" "}
        <a href="/register" className="text-violet-600 hover:underline font-medium">
          S&apos;inscrire
        </a>
      </p>
      <LoginForm />
    </div>
  );
}
