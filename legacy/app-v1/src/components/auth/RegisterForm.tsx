"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { registerAction } from "@/actions/auth";
import { useRouter } from "next/navigation";

interface Props {
  inviteToken?: string;
  prefillEmail?: string;
}

export function RegisterForm({ inviteToken, prefillEmail }: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);

		const formData = new FormData(e.currentTarget);
		const password = formData.get("password") as string;
		const confirm = formData.get("confirmPassword") as string;

		if (password !== confirm) {
			setError("Les mots de passe ne correspondent pas.");
			return;
		}

		// Inject invite token so registerAction can validate & skip email verification
		if (inviteToken) {
			formData.set("inviteToken", inviteToken);
		}

		startTransition(async () => {
			const result = await registerAction(formData);

			if (result.error) {
				setError(result.error);
				return;
			}

			// Invite flow: email already verified — sign in then let /invite page accept
			if (inviteToken && result.emailVerified) {
				const signInResult = await signIn("credentials", {
					email: formData.get("email") as string,
					password,
					redirect: false,
				});
				if (signInResult?.ok) {
					// Hard redirect so NextAuth session cookie is fully committed
					// before /invite/[token] server component runs acceptInvitationAction
					window.location.href = `/invite/${inviteToken}`;
					return;
				}
				// signIn failed unexpectedly — show generic error
				setError("Connexion automatique échouée. Connectez-vous manuellement.");
				return;
			}

			setSuccess(true);
		});
	}

	async function handleGoogleSignIn() {
		const callbackUrl = inviteToken ? `/invite/${inviteToken}` : "/onboarding/profile";
		await signIn("google", { callbackUrl });
	}

	if (success) {
		return (
			<div className="text-center space-y-4">
				<div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
					<svg
						className="w-6 h-6 text-green-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
				</div>
				<h2 className="text-lg font-semibold text-gray-900">
					Vérifiez vos emails
				</h2>
				<p className="text-sm text-gray-500">
					Nous vous avons envoyé un lien de vérification. Cliquez dessus pour
					activer votre compte.
				</p>
				<a
					href="/login"
					className="block text-sm text-violet-600 hover:underline"
				>
					Retour à la connexion
				</a>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Google OAuth */}
			<button
				type="button"
				onClick={handleGoogleSignIn}
				className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
			>
				<svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
					<path
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						fill="#4285F4"
					/>
					<path
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						fill="#34A853"
					/>
					<path
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						fill="#FBBC05"
					/>
					<path
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						fill="#EA4335"
					/>
				</svg>
				Continuer avec Google
			</button>

			<div className="relative">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-t border-gray-200" />
				</div>
				<div className="relative flex justify-center text-xs">
					<span className="bg-white px-2 text-gray-400">ou</span>
				</div>
			</div>

			<form onSubmit={handleSubmit} className="space-y-4">
				{error && (
					<div
						className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
						role="alert"
					>
						{error}
					</div>
				)}

				<div className="space-y-1">
					<label
						htmlFor="name"
						className="block text-sm font-medium text-gray-700"
					>
						Prénom et nom
					</label>
					<input
						id="name"
						name="name"
						type="text"
						autoComplete="name"
						className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors"
						placeholder="Jean Dupont"
					/>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="email"
						className="block text-sm font-medium text-gray-700"
					>
						Email{" "}
						<span className="text-red-500" aria-hidden="true">
							*
						</span>
					</label>
					<input
						id="email"
						name="email"
						type="email"
						autoComplete="email"
						required
						defaultValue={prefillEmail ?? ""}
						readOnly={!!inviteToken && !!prefillEmail}
						className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors read-only:bg-gray-50"
						placeholder="vous@exemple.com"
					/>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="password"
						className="block text-sm font-medium text-gray-700"
					>
						Mot de passe{" "}
						<span className="text-red-500" aria-hidden="true">
							*
						</span>
					</label>
					<input
						id="password"
						name="password"
						type="password"
						autoComplete="new-password"
						required
						minLength={8}
						className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors"
						placeholder="Minimum 8 caractères"
					/>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="confirmPassword"
						className="block text-sm font-medium text-gray-700"
					>
						Confirmer le mot de passe{" "}
						<span className="text-red-500" aria-hidden="true">
							*
						</span>
					</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						autoComplete="new-password"
						required
						className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors"
						placeholder="••••••••"
					/>
				</div>

				<button
					type="submit"
					disabled={isPending}
					className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
				>
					{isPending && (
						<svg
							className="animate-spin h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<circle
								className="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="4"
							/>
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							/>
						</svg>
					)}
					Créer mon compte
				</button>

				<p className="text-xs text-gray-400 text-center">
					En créant un compte, vous acceptez nos{" "}
					<a
						href="https://evoly.me/cgu"
						className="underline hover:text-gray-600"
					>
						CGU
					</a>{" "}
					et notre{" "}
					<a
						href="https://evoly.me/privacy"
						className="underline hover:text-gray-600"
					>
						politique de confidentialité
					</a>
					.
				</p>
			</form>
		</div>
	);
}
