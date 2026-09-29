"use client";

import { useState, useTransition } from "react";
import {
  inviteMemberAction,
  cancelInvitationAction,
  resendInvitationAction,
  changeMemberRoleAction,
  removeMemberAction,
  createRoleAction,
  deleteRoleAction,
} from "@/actions/members";

const ALL_PERMISSIONS = [
  { id: "EVENTS_CREATE", label: "Créer des événements" },
  { id: "EVENTS_EDIT", label: "Modifier des événements" },
  { id: "EVENTS_DELETE", label: "Supprimer des événements" },
  { id: "EVENTS_PUBLISH", label: "Publier des événements" },
  { id: "TICKETS_VIEW", label: "Voir les billets" },
  { id: "TICKETS_REFUND", label: "Rembourser des billets" },
  { id: "CHECKIN_SCAN", label: "Scanner (check-in)" },
  { id: "MEMBERS_INVITE", label: "Inviter des membres" },
  { id: "MEMBERS_REMOVE", label: "Retirer des membres" },
  { id: "MEMBERS_MANAGE_ROLES", label: "Gérer les rôles" },
  { id: "FINANCE_VIEW", label: "Voir les finances" },
  { id: "FINANCE_MANAGE", label: "Gérer les finances" },
  { id: "SETTINGS_EDIT", label: "Modifier les paramètres" },
  { id: "BILLING_MANAGE", label: "Gérer l'abonnement" },
  { id: "ROLES_CREATE", label: "Créer des rôles" },
  { id: "ROLES_EDIT", label: "Modifier des rôles" },
  { id: "ROLES_DELETE", label: "Supprimer des rôles" },
];

interface Member {
  id: string; userId: string; name: string; email: string;
  avatarUrl: string | null; roleId: string; roleName: string;
  isSystemRole: boolean; joinedAt: string;
}
interface Invitation {
  id: string; email: string; roleId: string;
  token: string; expiresAt: string; createdAt: string;
}
interface Role {
  id: string; name: string; isSystem: boolean;
  membersCount: number; permissions: string[];
}

interface Props {
  organizationId: string; orgSlug: string; currentUserId: string;
  canInvite: boolean; canManageRoles: boolean; canRemove: boolean; canCreateRoles: boolean;
  members: Member[]; invitations: Invitation[]; roles: Role[];
}

export function MembersManager({
  organizationId, orgSlug, currentUserId,
  canInvite, canManageRoles, canRemove, canCreateRoles,
  members: initialMembers, invitations: initialInvitations, roles: initialRoles,
}: Props) {
  const [tab, setTab] = useState<"members" | "roles">("members");
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [roles, setRoles] = useState(initialRoles);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState(roles.find(r => r.name === "Member")?.id ?? roles[0]?.id ?? "");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);

  function notify(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null); }
    else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 3500);
  }

  function handleInvite() {
    const fd = new FormData();
    fd.set("email", inviteEmail);
    fd.set("roleId", inviteRoleId);
    startTransition(async () => {
      const r = await inviteMemberAction(organizationId, fd);
      if (r.error) { notify(r.error, true); return; }
      notify(`Invitation envoyée à ${inviteEmail}`);
      setShowInviteModal(false);
      setInviteEmail("");
      window.location.reload();
    });
  }

  function handleCancelInvite(id: string) {
    startTransition(async () => {
      const r = await cancelInvitationAction(id, organizationId);
      if (r.error) { notify(r.error, true); return; }
      setInvitations(prev => prev.filter(i => i.id !== id));
    });
  }

  function handleResendInvite(id: string, email: string) {
    startTransition(async () => {
      const r = await resendInvitationAction(id, organizationId);
      if (r.error) { notify(r.error, true); return; }
      notify(`Invitation renvoyée à ${email}`);
    });
  }

  function handleChangeRole(memberId: string, newRoleId: string) {
    startTransition(async () => {
      const r = await changeMemberRoleAction(memberId, organizationId, newRoleId);
      if (r.error) { notify(r.error, true); return; }
      setMembers(prev => prev.map(m => {
        if (m.id !== memberId) return m;
        const role = roles.find(r => r.id === newRoleId);
        return { ...m, roleId: newRoleId, roleName: role?.name ?? m.roleName };
      }));
    });
  }

  function handleRemoveMember(memberId: string, name: string) {
    if (!confirm(`Retirer ${name} de l'organisation ?`)) return;
    startTransition(async () => {
      const r = await removeMemberAction(memberId, organizationId);
      if (r.error) { notify(r.error, true); return; }
      setMembers(prev => prev.filter(m => m.id !== memberId));
    });
  }

  function handleCreateRole() {
    const fd = new FormData();
    fd.set("name", newRoleName);
    newRolePerms.forEach(p => fd.append("permissions", p));
    startTransition(async () => {
      const r = await createRoleAction(organizationId, fd);
      if (r.error) { notify(r.error, true); return; }
      notify(`Rôle "${newRoleName}" créé`);
      setShowRoleModal(false);
      setNewRoleName(""); setNewRolePerms([]);
      window.location.reload();
    });
  }

  function handleDeleteRole(roleId: string, name: string) {
    if (!confirm(`Supprimer le rôle "${name}" ?`)) return;
    startTransition(async () => {
      const r = await deleteRoleAction(roleId, organizationId);
      if (r.error) { notify(r.error, true); return; }
      setRoles(prev => prev.filter(r => r.id !== roleId));
    });
  }

  function togglePerm(p: string) {
    setNewRolePerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  const expiresIn = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    const h = Math.floor(ms / 3600000);
    return h > 24 ? `${Math.floor(h / 24)}j` : `${h}h`;
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Membres & Rôles</h1>
        {canInvite && tab === "members" && (
          <button onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors">
            + Inviter
          </button>
        )}
        {canCreateRoles && tab === "roles" && (
          <button onClick={() => setShowRoleModal(true)}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors">
            + Nouveau rôle
          </button>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">✓ {success}</div>}

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 w-fit gap-1">
        {(["members", "roles"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
            {t === "members" ? `Membres (${members.length})` : `Rôles (${roles.length})`}
          </button>
        ))}
      </div>

      {/* Members tab */}
      {tab === "members" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-600 flex-shrink-0">
                  {m.avatarUrl
                    ? <img src={m.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                    : (m.name[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                    {m.userId === currentUserId && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">vous</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageRoles && !m.isSystemRole ? (
                    <select
                      value={m.roleId}
                      onChange={e => handleChangeRole(m.id, e.target.value)}
                      disabled={isPending}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">{m.roleName}</span>
                  )}
                  {canRemove && m.userId !== currentUserId && (
                    <button onClick={() => handleRemoveMember(m.id, m.name)}
                      className="text-xs text-red-400 hover:text-red-600 px-1" aria-label="Retirer">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Invitations en attente</h3>
              <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                {invitations.map(inv => (
                  <div key={inv.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-sm flex-shrink-0">⏳</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{inv.email}</p>
                        <p className="text-xs text-gray-400">Expire dans {expiresIn(inv.expiresAt)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleResendInvite(inv.id, inv.email)} disabled={isPending}
                          className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                          Renvoyer
                        </button>
                        <button onClick={() => handleCancelInvite(inv.id)} disabled={isPending}
                          className="text-xs px-2 py-1 text-red-400 hover:text-red-600">✕</button>
                      </div>
                    </div>
                    {/* Lien d'invitation copiable */}
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className="text-[11px] text-gray-400 truncate flex-1 font-mono">
                        {typeof window !== "undefined" ? window.location.origin : ""}/invite/{inv.token}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/invite/${inv.token}`;
                          navigator.clipboard.writeText(url);
                          notify("Lien copié !");
                        }}
                        className="text-[11px] text-violet-600 hover:underline flex-shrink-0"
                      >
                        Copier
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roles tab */}
      {tab === "roles" && (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {roles.map(role => (
            <div key={role.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{role.name}</p>
                  {role.isSystem && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Système</span>
                  )}
                  <span className="text-xs text-gray-400">{role.membersCount} membre{role.membersCount !== 1 ? "s" : ""}</span>
                </div>
                {!role.isSystem && canCreateRoles && (
                  <button onClick={() => handleDeleteRole(role.id, role.name)} disabled={role.membersCount > 0 || isPending}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed">
                    Supprimer
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 6).map(p => (
                  <span key={p} className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">
                    {ALL_PERMISSIONS.find(x => x.id === p)?.label ?? p}
                  </span>
                ))}
                {role.permissions.length > 6 && (
                  <span className="text-[10px] text-gray-400">+{role.permissions.length - 6}</span>
                )}
                {role.permissions.length === 0 && <span className="text-xs text-gray-300">Aucune permission</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <Modal title="Inviter un membre" onClose={() => setShowInviteModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="prenom@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rôle</label>
              <select value={inviteRoleId} onChange={e => setInviteRoleId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowInviteModal(false)}
                className="flex-1 py-2 border border-gray-300 text-sm rounded-xl hover:bg-gray-50">Annuler</button>
              <button onClick={handleInvite} disabled={!inviteEmail || isPending}
                className="flex-1 py-2 bg-violet-600 text-white text-sm rounded-xl disabled:opacity-50 hover:bg-violet-700 transition-colors">
                {isPending ? "..." : "Envoyer"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create role modal */}
      {showRoleModal && (
        <Modal title="Créer un rôle" onClose={() => setShowRoleModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom du rôle</label>
              <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                placeholder="ex: Bénévole, Comptable…"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Permissions</label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newRolePerms.includes(p.id)}
                      onChange={() => togglePerm(p.id)}
                      className="rounded text-violet-600 focus:ring-violet-500" />
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowRoleModal(false)}
                className="flex-1 py-2 border border-gray-300 text-sm rounded-xl hover:bg-gray-50">Annuler</button>
              <button onClick={handleCreateRole} disabled={!newRoleName || isPending}
                className="flex-1 py-2 bg-violet-600 text-white text-sm rounded-xl disabled:opacity-50 hover:bg-violet-700">
                {isPending ? "..." : "Créer"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
