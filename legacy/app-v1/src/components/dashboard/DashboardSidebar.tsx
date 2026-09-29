"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Organization, Permission } from "@evoly/db";

interface DashboardSidebarProps {
  currentOrg: Organization & { plan: { name: string } };
  allOrgs: Organization[];
  userPermissions: Permission[];
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

export function DashboardSidebar({
  currentOrg,
  allOrgs,
  userPermissions,
  user,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const baseUrl = `/dashboard/${currentOrg.slug}`;

  const hasPermission = (permission: Permission) =>
    userPermissions.includes(permission);

  const isActive = (path: string, exact = false) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + "/");

  const navItems = [
    {
      href: baseUrl,
      label: "Accueil",
      exact: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      show: true,
    },
    {
      href: `${baseUrl}/events`,
      label: "Événements",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m-6-2v2M7 5a2 2 0 00-2 2v11a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2H7z" />
        </svg>
      ),
      show: true,
    },
  ];

  const adminItems = [
    {
      href: `${baseUrl}/members`,
      label: "Membres & rôles",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      exact: false,
      show: hasPermission("MEMBERS_INVITE") || hasPermission("MEMBERS_MANAGE_ROLES"),
    },
    {
      href: `${baseUrl}/settings`,
      label: "Paramètres",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      exact: false,
      show: hasPermission("SETTINGS_EDIT"),
    },
    {
      href: `${baseUrl}/domains`,
      label: "Domaines",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      ),
      exact: false,
      show: hasPermission("SETTINGS_EDIT"),
    },
    {
      href: `${baseUrl}/finances`,
      label: "Finances",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      exact: false,
      show: hasPermission("FINANCE_VIEW"),
    },
    {
      href: `${baseUrl}/billing`,
      label: "Abonnement",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      exact: false,
      show: hasPermission("BILLING_MANAGE"),
    },
    {
      href: `${baseUrl}/referral`,
      label: "Parrainage",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      exact: false,
      show: hasPermission("BILLING_MANAGE"),
    },
  ];

  const NavLink = ({ href, label, icon, show, exact }: typeof navItems[0]) => {
    if (!show) return null;
    const active = isActive(href, exact ?? false);
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          active
            ? "bg-violet-100 text-violet-700 font-medium"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
        aria-current={active ? "page" : undefined}
      >
        <span className={active ? "text-violet-600" : "text-gray-400"}>{icon}</span>
        {label}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Org switcher */}
      <div className="p-4 border-b border-gray-100">
        <button
          onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
          aria-expanded={orgSwitcherOpen}
          aria-haspopup="listbox"
        >
          <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-violet-700 text-xs font-bold">
              {currentOrg.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{currentOrg.name}</p>
            <p className="text-xs text-gray-400">{currentOrg.plan.name}</p>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${orgSwitcherOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {orgSwitcherOpen && (
          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden" role="listbox">
            {allOrgs.map((org) => (
              <Link
                key={org.id}
                href={`/dashboard/${org.slug}`}
                onClick={() => setOrgSwitcherOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                  org.id === currentOrg.id ? "bg-violet-50 text-violet-700" : "text-gray-700"
                }`}
                role="option"
                aria-selected={org.id === currentOrg.id}
              >
                <div className="w-7 h-7 bg-violet-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <span className="text-violet-700 text-xs font-bold">
                    {org.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <span className="truncate">{org.name}</span>
                {org.id === currentOrg.id && (
                  <svg className="w-4 h-4 ml-auto text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Navigation principale">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {adminItems.some((i) => i.show) && (
          <>
            <div className="pt-3 pb-1">
              <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                Administration
              </p>
            </div>
            {adminItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <span className="text-gray-500 text-xs font-medium">
                {(user.name ?? user.email).slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.name ?? user.email}
            </p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Se déconnecter"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 h-screen flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center h-14 px-4 bg-white border-b border-gray-200">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
          aria-label="Ouvrir le menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="ml-3 text-sm font-semibold text-gray-900">{currentOrg.name}</span>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 bg-white h-full shadow-xl flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
              aria-label="Fermer le menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
