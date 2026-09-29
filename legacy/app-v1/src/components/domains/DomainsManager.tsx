"use client";

import { useState, useTransition, useCallback } from "react";
import {
	checkSubdomainAvailabilityAction,
	updateSubdomainAction,
	addCustomDomainAction,
	deleteCustomDomainAction,
	verifyDomainDnsAction,
} from "@/actions/domains";

interface CustomDomain {
	id: string;
	domain: string;
	scope: string;
	status: string;
	sslStatus: string;
	verifiedAt: string | null;
	lastCheckedAt: string | null;
	eventTitle: string | null;
	eventSlug: string | null;
}

interface Props {
	org: {
		id: string;
		slug: string;
		isPro: boolean;
		previousSubdomain: string | null;
		subdomainChangedAt: string | null;
	};
	customDomains: CustomDomain[];
}

export function DomainsManager({ org, customDomains: initialDomains }: Props) {
	const [domains, setDomains] = useState(initialDomains);
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	// Subdomain form
	const [newSlug, setNewSlug] = useState(org.slug);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
	const [slugChecking, setSlugChecking] = useState(false);

	// Custom domain form
	const [newDomain, setNewDomain] = useState("");
	const [showAddDomain, setShowAddDomain] = useState(false);

	// Verify states per domain
	const [verifyingId, setVerifyingId] = useState<string | null>(null);
	const [verifyResults, setVerifyResults] = useState<
		Record<string, { verified: boolean; error?: string | null }>
	>({});

	// Slug check with debounce
	const checkSlug = useCallback(
		(() => {
			let timer: NodeJS.Timeout;
			return (slug: string) => {
				clearTimeout(timer);
				if (slug === org.slug) {
					setSlugAvailable(null);
					return;
				}
				if (slug.length < 3) {
					setSlugAvailable(false);
					return;
				}
				setSlugChecking(true);
				timer = setTimeout(async () => {
					const result = await checkSubdomainAvailabilityAction(slug, org.id);
					setSlugAvailable(result.available);
					setSlugChecking(false);
				}, 400);
			};
		})(),
		[org.id, org.slug],
	);

	function handleSlugChange(val: string) {
		const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, "");
		setNewSlug(clean);
		checkSlug(clean);
	}

	function handleSubdomainSave() {
		setError(null);
		startTransition(async () => {
			const result = await updateSubdomainAction(org.id, newSlug);
			if (result.error) {
				setError(result.error);
				return;
			}
			setSuccess(`Sous-domaine mis à jour → ${result.newSlug}.evoly.me`);
			setTimeout(
				() => (window.location.href = `/dashboard/${result.newSlug}/domains`),
				1200,
			);
		});
	}

	function handleAddDomain() {
		setError(null);
		startTransition(async () => {
			const result = await addCustomDomainAction(org.id, newDomain);
			if (result.error) {
				setError(result.error);
				return;
			}
			setSuccess("Domaine ajouté. Configurez votre DNS pour l'activer.");
			setNewDomain("");
			setShowAddDomain(false);
			setTimeout(() => window.location.reload(), 800);
		});
	}

	function handleDeleteDomain(domainId: string, domain: string) {
		if (!confirm(`Supprimer ${domain} ?`)) return;
		startTransition(async () => {
			const result = await deleteCustomDomainAction(domainId, org.id);
			if (result.error) {
				setError(result.error);
				return;
			}
			setDomains((prev) => prev.filter((d) => d.id !== domainId));
		});
	}

	function handleVerify(domainId: string) {
		setVerifyingId(domainId);
		startTransition(async () => {
			const result = await verifyDomainDnsAction(domainId, org.id);
			setVerifyingId(null);
			if (result.error && !("verified" in result)) {
				setError(result.error);
				return;
			}
			if ("verified" in result) {
				setVerifyResults((prev) => ({
					...prev,
					[domainId]: {
						verified: result.verified!,
						error: result.error ?? undefined,
					},
				}));
				if (result.verified) {
					setDomains((prev) =>
						prev.map((d) =>
							d.id === domainId
								? {
										...d,
										status: "ACTIVE",
										sslStatus: "ACTIVE",
										verifiedAt: new Date().toISOString(),
									}
								: d,
						),
					);
				}
			}
		});
	}

	const BASE_DOMAIN = "evoly.me";
	const CNAME_TARGET = process.env.NEXT_PUBLIC_CNAME_TARGET ?? "app.evoly.me";

	const statusIcon = (status: string) => {
		if (status === "ACTIVE") return <span className="text-green-500">✅</span>;
		if (status === "ERROR") return <span className="text-red-500">❌</span>;
		return <span className="text-amber-500">⏳</span>;
	};

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-bold text-gray-900">Domaines</h1>
				<p className="text-sm text-gray-500 mt-0.5">
					Configurez votre sous-domaine et vos domaines personnalisés.
				</p>
			</div>

			{error && (
				<div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
					{error}
				</div>
			)}
			{success && (
				<div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
					✓ {success}
				</div>
			)}

			{/* Sous-domaine org */}
			<div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
				<div>
					<h2 className="text-sm font-semibold text-gray-900">
						Sous-domaine Evoly
					</h2>
					<p className="text-xs text-gray-400 mt-0.5">
						Disponible sur tous les plans.
					</p>
				</div>

				<div className="space-y-1.5">
					<label className="block text-xs font-medium text-gray-600">
						Votre sous-domaine
					</label>
					<div className="flex rounded-xl border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
						<input
							type="text"
							value={newSlug}
							onChange={(e) => handleSlugChange(e.target.value)}
							maxLength={50}
							className="flex-1 px-3 py-2 text-sm focus:outline-none bg-white"
							placeholder="mon-asso"
						/>
						<span className="px-3 py-2 bg-gray-50 text-sm text-gray-400 border-l border-gray-300 whitespace-nowrap">
							.{BASE_DOMAIN}
						</span>
					</div>
					<div className="h-4 flex items-center">
						{slugChecking && (
							<p className="text-xs text-gray-400">Vérification...</p>
						)}
						{!slugChecking &&
							slugAvailable === true &&
							newSlug !== org.slug && (
								<p className="text-xs text-green-600">✓ Disponible</p>
							)}
						{!slugChecking && slugAvailable === false && (
							<p className="text-xs text-red-500">✗ Non disponible</p>
						)}
					</div>
				</div>

				{org.previousSubdomain && org.subdomainChangedAt && (
					<div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
						<strong>
							{org.previousSubdomain}.{BASE_DOMAIN}
						</strong>{" "}
						redirige vers votre nouveau sous-domaine jusqu&apos;au{" "}
						{new Date(
							new Date(org.subdomainChangedAt).getTime() +
								180 * 24 * 60 * 60 * 1000,
						).toLocaleDateString("fr-FR")}
						.
					</div>
				)}

				<button
					type="button"
					onClick={handleSubdomainSave}
					disabled={
						isPending ||
						newSlug === org.slug ||
						slugAvailable === false ||
						slugChecking
					}
					className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
				>
					{isPending ? "Sauvegarde..." : "Mettre à jour"}
				</button>
			</div>

			{/* Domaines custom (Pro) */}
			<div
				className={`bg-white rounded-2xl border p-5 space-y-4 ${!org.isPro ? "opacity-60" : "border-gray-200"}`}
			>
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
							Domaines personnalisés
							{!org.isPro && (
								<span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-medium">
									Pro
								</span>
							)}
						</h2>
						<p className="text-xs text-gray-400 mt-0.5">
							Pointez votre propre domaine vers Evoly.
						</p>
					</div>
					{org.isPro && (
						<button
							type="button"
							onClick={() => setShowAddDomain(true)}
							disabled={domains.length >= 10}
							className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-40 transition-colors"
						>
							+ Ajouter
						</button>
					)}
				</div>

				{!org.isPro ? (
					<div className="text-center py-4">
						<p className="text-sm text-gray-500 mb-3">
							Disponible avec le plan Pro.
						</p>
						<a
							href="billing"
							className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
						>
							Passer au Pro
						</a>
					</div>
				) : (
					<>
						{showAddDomain && (
							<div className="bg-gray-50 rounded-xl p-4 space-y-3">
								<p className="text-xs font-medium text-gray-700">
									Ajouter un domaine custom
								</p>
								<input
									type="text"
									value={newDomain}
									onChange={(e) =>
										setNewDomain(e.target.value.toLowerCase().trim())
									}
									placeholder="tickets.monsite.com"
									className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
								/>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => setShowAddDomain(false)}
										className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
									>
										Annuler
									</button>
									<button
										type="button"
										onClick={handleAddDomain}
										disabled={!newDomain || isPending}
										className="flex-1 px-3 py-2 bg-violet-600 text-white text-sm rounded-lg disabled:opacity-50 hover:bg-violet-700"
									>
										Ajouter
									</button>
								</div>
							</div>
						)}

						{domains.length === 0 && !showAddDomain ? (
							<p className="text-sm text-gray-400 text-center py-4">
								Aucun domaine custom configuré.
							</p>
						) : (
							<div className="space-y-3">
								{domains.map((d) => {
									const vr = verifyResults[d.id];
									return (
										<div
											key={d.id}
											className="border border-gray-200 rounded-xl p-4 space-y-3"
										>
											<div className="flex items-center justify-between gap-2">
												<div className="min-w-0">
													<div className="flex items-center gap-2">
														{statusIcon(d.status)}
														<span className="text-sm font-medium text-gray-900">
															{d.domain}
														</span>
													</div>
													<div className="flex items-center gap-2 mt-0.5">
														<span className="text-xs text-gray-400">
															{d.scope === "EVENT" && d.eventTitle
																? `Événement : ${d.eventTitle}`
																: "Organisation"}
														</span>
														{d.status === "ACTIVE" && (
															<span className="text-xs text-green-600">
																SSL actif
															</span>
														)}
													</div>
												</div>
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => handleVerify(d.id)}
														disabled={verifyingId === d.id}
														className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
													>
														{verifyingId === d.id ? "..." : "Vérifier DNS"}
													</button>
													<button
														type="button"
														onClick={() => handleDeleteDomain(d.id, d.domain)}
														className="text-xs p-1 text-red-400 hover:text-red-600 rounded"
														aria-label="Supprimer"
													>
														✕
													</button>
												</div>
											</div>

											{/* DNS instructions */}
											{d.status !== "ACTIVE" && (
												<DnsInstructions
													domain={d.domain}
													cnameTarget={CNAME_TARGET}
												/>
											)}

											{/* Verify result */}
											{vr && (
												<div
													className={`text-xs rounded-lg p-2 ${vr.verified ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
												>
													{vr.verified
														? "✓ DNS vérifié ! SSL en cours d'activation."
														: `✗ ${vr.error}`}
												</div>
											)}
										</div>
									);
								})}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

// ── DNS Instructions ──

function DnsInstructions({
	domain,
	cnameTarget,
}: {
	domain: string;
	cnameTarget: string;
}) {
	const [registrar, setRegistrar] = useState("generic");
	const [copied, setCopied] = useState<string | null>(null);

	function copy(text: string, key: string) {
		navigator.clipboard.writeText(text);
		setCopied(key);
		setTimeout(() => setCopied(null), 1500);
	}

	const prefix = domain.split(".")[0];
	const isApex = domain.split(".").length === 2;

	const registrars = [
		{ id: "generic", label: "Générique" },
		{ id: "ovh", label: "OVH" },
		{ id: "cloudflare", label: "Cloudflare" },
		{ id: "namecheap", label: "Namecheap" },
		{ id: "gandi", label: "Gandi" },
	];

	const instructions: Record<string, string> = {
		generic:
			"Accédez à la zone DNS de votre registrar et ajoutez un enregistrement CNAME.",
		ovh: "OVH → Zone DNS → Ajouter une entrée → CNAME",
		cloudflare:
			"Cloudflare → DNS → Add record → Type: CNAME (désactivez le proxy orange)",
		namecheap:
			"Namecheap → Domain List → Manage → Advanced DNS → Add New Record → CNAME",
		gandi: "Gandi → Noms de domaine → Zone DNS → Ajouter un enregistrement",
	};

	return (
		<div className="bg-gray-50 rounded-lg p-3 space-y-3">
			<p className="text-xs font-medium text-gray-700">
				Configuration DNS requise
			</p>

			{/* Registrar selector */}
			<div className="flex flex-wrap gap-1">
				{registrars.map((r) => (
					<button
						key={r.id}
						type="button"
						onClick={() => setRegistrar(r.id)}
						className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
							registrar === r.id
								? "bg-violet-600 text-white border-violet-600"
								: "border-gray-300 text-gray-600 hover:bg-white"
						}`}
					>
						{r.label}
					</button>
				))}
			</div>

			<p className="text-xs text-gray-500">{instructions[registrar]}</p>

			{isApex && (
				<p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
					⚠️ Les domaines apex (sans sous-domaine) ne supportent pas les CNAME.
					Utilisez un sous-domaine comme <strong>tickets.{domain}</strong>.
				</p>
			)}

			{/* DNS record */}
			<div className="font-mono text-xs space-y-1.5">
				{[
					{ label: "Type", value: "CNAME" },
					{ label: "Nom", value: isApex ? "@" : prefix },
					{ label: "Valeur", value: cnameTarget },
					{ label: "TTL", value: "3600" },
				].map(({ label, value }) => (
					<div
						key={label}
						className="flex items-center justify-between bg-white rounded px-2 py-1 border border-gray-200"
					>
						<span className="text-gray-400 w-12">{label}</span>
						<span className="text-gray-900 flex-1 mx-2 truncate">{value}</span>
						<button
							type="button"
							onClick={() => copy(value, label)}
							className="text-violet-500 hover:text-violet-700 flex-shrink-0"
						>
							{copied === label ? "✓" : "copier"}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
