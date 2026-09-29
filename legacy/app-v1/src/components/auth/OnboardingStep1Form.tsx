"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkSlugAvailability, onboardingStep1Action } from "@/actions/auth";
import { acceptInvitationByCodeAction, checkInviteCodeAction } from "@/actions/members";

function slugify(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.trim()
		.substring(0, 50);
}

export function OnboardingStep1Form({ userId }: { userId: string }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	// Toggle: create org or join existing
	const [mode, setMode] = useState<"create" | "join">("create");

	// Create mode
	const [orgName, setOrgName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugStatus, setSlugStatus] = useState<
		"idle" | "checking" | "available" | "taken" | "reserved"
	>("idle");

	// Join mode
	const [inviteCode, setInviteCode] = useState("");
	const [codeStatus, setCodeStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
	const [codeOrgName, setCodeOrgName] = useState<string | null>(null);

	// Auto-generate slug from org name
	useEffect(() => {
		const generated = slugify(orgName);
		if (generated !== slug) setSlug(generated);
	}, [orgName]);

	// Check slug availability with debounce
	useEffect(() => {
		if (!slug || slug.length < 3) { setSlugStatus("idle"); return; }
		setSlugStatus("checking");
		const timer = setTimeout(async () => {
			const result = await checkSlugAvailability(slug);
			setSlugStatus(!result.available ? (result.reason ? "reserved" : "taken") : "available");
		}, 500);
		return () => clearTimeout(timer);
	}, [slug]);

	// Check invite code with debounce
	useEffect(() => {
		const code = inviteCode.trim().toUpperCase();
		if (code.length < 6) { setCodeStatus("idle"); setCodeOrgName(null); return; }
		setCodeStatus("checking");
		const timer = setTimeout(async () => {
			const result = await checkInviteCodeAction(code);
			if (result.valid) {
				setCodeStatus("valid");
				setCodeOrgName(result.orgName ?? null);
			} else {
				setCodeStatus("invalid");
				setCodeOrgName(null);
			}
		}, 500);
		return () => clearTimeout(timer);
	}, [inviteCode]);

	async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		if (slugStatus === "taken" || slugStatus === "reserved") {
			setError("Ce slug n'est pas disponible.");
			return;
		}
		const formData = new FormData(e.currentTarget);
		formData.set("slug", slug);
		startTransition(async () => {
			const result = await onboardingStep1Action(userId, formData);
			if (result.error) { setError(result.error); return; }
			if (result.organizationId) sessionStorage.setItem("onboarding_org_id", result.organizationId);
			router.push("/onboarding/activity");
		});
	}

	async function handleJoin(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		if (codeStatus !== "valid") { setError("Code d'invitation invalide."); return; }
		startTransition(async () => {
			const result = await acceptInvitationByCodeAction(inviteCode.trim().toUpperCase());
			if (result.error) { setError(result.error); return; }
			if (result.orgSlug) router.push(`/dashboard/${result.orgSlug}`);
			else router.push("/dashboard");
		});
	}

	const slugStatusIcon = {
		idle: null,
		checking: <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>,
		available: <span className="text-green-500 text-xs font-medium">✓ Disponible</span>,
		taken: <span className="text-red-500 text-xs font-medium">✗ Déjà pris</span>,
		reserved: <span className="text-red-500 text-xs font-medium">✗ Réservé</span>,
	};

	return (
		<div className="space-y-5">
			{/* Toggle */}
			<div className="flex rounded-xl border border-gray-200 p-1 bg-gray-50 gap-1">
				<button
					type="button"
					onClick={() => { setMode("create"); setError(null); }}
					className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
						mode === "create"
							? "bg-white text-violet-700 shadow-sm border border-gray-200"
							: "text-gray-500 hover:text-gray-700"
					}`}
				>
					Créer une organisation
				</button>
				<button
					type="button"
					onClick={() => { setMode("join"); setError(null); }}
					className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
						mode === "join"
							? "bg-white text-violet-700 shadow-sm border border-gray-200"
							: "text-gray-500 hover:text-gray-700"
					}`}
				>
					Rejoindre une organisation
				</button>
			</div>

			{error && (
				<div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
					{error}
				</div>
			)}

			{mode === "create" ? (
				<form onSubmit={handleCreate} className="space-y-5">
					<div className="space-y-1">
						<label htmlFor="organizationName" className="block text-sm font-medium text-gray-700">
							Nom de l&apos;organisation{" "}
							<span className="text-red-500" aria-hidden="true">*</span>
						</label>
						<input
							id="organizationName"
							name="organizationName"
							type="text"
							required
							value={orgName}
							onChange={(e) => setOrgName(e.target.value)}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors"
							placeholder="Mon Association Culturelle"
							maxLength={100}
						/>
					</div>

					<div className="space-y-1">
						<label htmlFor="slug" className="block text-sm font-medium text-gray-700">
							Adresse Evoly
						</label>
						<div className="flex items-center">
							<span className="flex-shrink-0 px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500">
								evoly.me/
							</span>
							<div className="relative flex-1">
								<input
									id="slug"
									name="slug"
									type="text"
									required
									value={slug}
									onChange={(e) => setSlug(slugify(e.target.value))}
									className="w-full px-3 py-2 border border-gray-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors"
									placeholder="mon-association"
									minLength={3}
									maxLength={50}
								/>
							</div>
						</div>
						<div className="flex justify-between items-center">
							<p className="text-xs text-gray-400">
								Lettres minuscules, chiffres et tirets. Min. 3 caractères.
							</p>
							<span className="text-xs">{slugStatusIcon[slugStatus]}</span>
						</div>
					</div>

					<button
						type="submit"
						disabled={isPending || slugStatus === "taken" || slugStatus === "reserved" || slug.length < 3}
						className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
					>
						{isPending && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
						Continuer
					</button>
				</form>
			) : (
				<form onSubmit={handleJoin} className="space-y-5">
					<div className="space-y-1">
						<label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700">
							Code d&apos;invitation
						</label>
						<input
							id="inviteCode"
							name="inviteCode"
							type="text"
							required
							value={inviteCode}
							onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors uppercase"
							placeholder="AB12CD34"
							maxLength={20}
						/>
						<div className="flex items-center justify-between">
							<p className="text-xs text-gray-400">
								Demandez ce code à l&apos;administrateur de l&apos;organisation.
							</p>
							{codeStatus === "checking" && (
								<svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
							)}
							{codeStatus === "valid" && codeOrgName && (
								<span className="text-green-600 text-xs font-medium">✓ {codeOrgName}</span>
							)}
							{codeStatus === "invalid" && (
								<span className="text-red-500 text-xs font-medium">✗ Code invalide</span>
							)}
						</div>
					</div>

					{codeStatus === "valid" && codeOrgName && (
						<div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-lg">
							<div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
								<svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
							</div>
							<div>
								<p className="text-sm font-medium text-violet-900">{codeOrgName}</p>
								<p className="text-xs text-violet-600">Vous allez rejoindre cette organisation</p>
							</div>
						</div>
					)}

					<button
						type="submit"
						disabled={isPending || codeStatus !== "valid"}
						className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
					>
						{isPending && <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
						Rejoindre l&apos;organisation
					</button>
				</form>
			)}
		</div>
	);
}

