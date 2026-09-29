"use client";

import { useState, useTransition } from "react";
import { updateOrgSettingsAction, deleteOrganizationAction } from "@/actions/settings";
import { useRouter } from "next/navigation";

const TIMEZONES = [
  "Europe/Paris", "Europe/Brussels", "Europe/London", "Europe/Berlin",
  "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "America/Montreal",
];

interface Props {
  org: {
    id: string; slug: string; name: string; description: string | null;
    email: string | null; timezone: string; type: string; logoUrl: string | null;
  };
  canDelete: boolean;
  deleteBlockReason: string | null;
}

export function OrgSettingsForm({ org, canDelete, deleteBlockReason }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0);

  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");
  const [email, setEmail] = useState(org.email ?? "");
  const [timezone, setTimezone] = useState(org.timezone);
  const [type, setType] = useState(org.type);
  const [logoUrl, setLogoUrl] = useState(org.logoUrl ?? "");

  function handleSave() {
    setError(null); setSuccess(false);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    fd.set("email", email);
    fd.set("timezone", timezone);
    fd.set("type", type);
    fd.set("logoUrl", logoUrl);
    startTransition(async () => {
      const r = await updateOrgSettingsAction(org.id, fd);
      if (r.error) { setError(r.error); return; }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    });
  }

  function handleDelete() {
    if (deleteStep < 1) { setDeleteStep(1); return; }
    startTransition(async () => {
      const r = await deleteOrganizationAction(org.id);
      if (r.error) { setError(r.error); setDeleteStep(0); return; }
      router.push("/dashboard");
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Paramètres</h1>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">✓ Modifications sauvegardées</div>}

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Informations générales</h2>

        <Field label="Nom de l'organisation *">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
        </Field>

        <Field label="Email de contact">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </Field>

        <Field label="URL du logo">
          <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="mt-2 h-10 rounded object-contain" />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="INDIVIDUAL">Particulier</option>
              <option value="ASSOCIATION">Association</option>
              <option value="COMPANY">Entreprise</option>
            </select>
          </Field>

          <Field label="Fuseau horaire">
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace("_", " ")}</option>)}
            </select>
          </Field>
        </div>

        <div className="pt-1">
          <button onClick={handleSave} disabled={isPending || !name.trim()}
            className="px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl disabled:opacity-50 hover:bg-violet-700 transition-colors">
            {isPending ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-red-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-red-600">Zone de danger</h2>
        <p className="text-sm text-gray-500">
          La suppression de l'organisation est <strong>irréversible</strong>. Toutes les données seront perdues.
        </p>
        {deleteBlockReason && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">{deleteBlockReason}</p>
        )}
        {deleteStep === 1 && (
          <p className="text-sm font-semibold text-red-600">Confirmer ? Cette action est irréversible.</p>
        )}
        <button
          onClick={handleDelete}
          disabled={!canDelete || isPending}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl disabled:opacity-30 hover:bg-red-700 transition-colors"
        >
          {deleteStep === 0 ? "Supprimer l'organisation" : "Confirmer la suppression"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
