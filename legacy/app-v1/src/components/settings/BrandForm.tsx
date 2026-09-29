"use client";

import { useState, useTransition } from "react";
import { saveBrandAction } from "@/actions/brand";

interface Brand {
  id: string;
  brandName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  fromName: string | null;
}

interface Props {
  organizationId: string;
  orgSlug: string;
  isPro: boolean;
  brand: Brand | null;
}

export function BrandForm({ organizationId, orgSlug, isPro, brand }: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brandName, setBrandName] = useState(brand?.brandName ?? "");
  const [logoUrl, setLogoUrl] = useState(brand?.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(brand?.faviconUrl ?? "");
  const [primaryColor, setPrimaryColor] = useState(brand?.primaryColor ?? "#7c3aed");
  const [accentColor, setAccentColor] = useState(brand?.accentColor ?? "#a78bfa");
  const [fromName, setFromName] = useState(brand?.fromName ?? "");

  function handleSubmit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBrandAction({
        organizationId,
        brandName: brandName || null,
        logoUrl: logoUrl || null,
        faviconUrl: faviconUrl || null,
        primaryColor,
        accentColor,
        fromName: fromName || null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  const disabled = !isPro;

  return (
    <div className={`space-y-8 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Locked banner */}
      {!isPro && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">✨</span>
          <div>
            <p className="font-semibold text-violet-800 text-sm">Passez au plan Pro</p>
            <p className="text-violet-600 text-xs">
              Le white-label est disponible avec le plan Pro et un domaine custom vérifié.{" "}
              <a href={`/dashboard/${orgSlug}/billing`} className="underline font-medium">
                Voir les plans
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Identity */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Identité</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom de marque
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Mon Association"
              maxLength={80}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Remplace "evoly" dans l'en-tête de vos pages et emails.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL du logo
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://cdn.monsite.com/logo.png"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo preview"
                className="mt-2 h-10 object-contain rounded border border-gray-100"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL du favicon
            </label>
            <input
              type="url"
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              placeholder="https://cdn.monsite.com/favicon.ico"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </section>

      {/* Colors */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Couleurs</h2>
        <div className="flex gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Couleur principale
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setPrimaryColor(e.target.value);
                }}
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Couleur accent
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setAccentColor(e.target.value);
                }}
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
          <div
            className="px-5 py-3 flex items-center gap-2"
            style={{ backgroundColor: primaryColor }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-6 object-contain" />
            ) : (
              <span className="text-white font-bold text-sm">{brandName || "evoly"}</span>
            )}
          </div>
          <div className="p-4 bg-white">
            <button
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: primaryColor }}
            >
              Acheter un billet
            </button>
            <button
              className="ml-3 px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ color: primaryColor, borderColor: accentColor }}
            >
              En savoir plus
            </button>
          </div>
        </div>
      </section>

      {/* Email */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Emails</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nom de l'expéditeur
          </label>
          <input
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Les Événements de Mon Asso"
            maxLength={80}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Affiché comme expéditeur dans la boîte mail de vos acheteurs.
          </p>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {saved && <span className="text-green-600 text-sm">✓ Sauvegardé</span>}
        {error && <span className="text-red-600 text-sm">{error}</span>}
      </div>
    </div>
  );
}
