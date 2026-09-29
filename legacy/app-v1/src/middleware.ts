import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PROTECTED_ROUTES = ["/dashboard", "/onboarding"];
const AUTH_ROUTES = [
	"/login",
	"/register",
	"/forgot-password",
	"/reset-password",
];

export default auth(async (req) => {
	const { pathname } = req.nextUrl;
	const session = req.auth;
	const host = req.headers.get("host") ?? "";

	// ── Subdomain / custom domain routing ──────────────────────
	const appHost = process.env.NEXT_PUBLIC_APP_HOST ?? "app.evoly.me";
	const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "evoly.me";

	// Strip port for comparison
	const hostWithoutPort = host.split(":")[0];

	// Only route if not the main app host and not localhost
	const isLocal =
		hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1";

	if (
		!isLocal &&
		hostWithoutPort !== appHost &&
		hostWithoutPort !== `www.${baseDomain}` &&
		!hostWithoutPort.endsWith(`.${appHost}`)
	) {
		// Paths that must be accessible on all subdomains — never rewrite them
		const BYPASS_PREFIXES = [
			"/confirmation",
			"/tickets",
			"/refund",
			"/resale",
			"/verify",
			"/invite",
			"/unsubscribe",
			"/cd/",
			"/o/",
			"/e/",
		];
			if (BYPASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
			return NextResponse.next();
		}

		// Check if it's a subdomain of evoly.me (e.g. mon-asso.evoly.me)
		if (hostWithoutPort.endsWith(`.${baseDomain}`)) {
			const subdomain = hostWithoutPort.replace(`.${baseDomain}`, "");
			// Reserved subdomains handled separately
			if (!["app", "scanner", "www"].includes(subdomain)) {
				// Rewrite to public org/event page
				const url = req.nextUrl.clone();
				url.pathname = `/o/${subdomain}${pathname}`;
				return NextResponse.rewrite(url);
			}
		} else {
			// Custom domain — rewrite to custom domain handler
			const url = req.nextUrl.clone();
			url.pathname = `/cd/${hostWithoutPort}${pathname}`;
			return NextResponse.rewrite(url);
		}
	}

	// ── Auth guards ─────────────────────────────────────────────
	if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
		if (!session?.user) {
			const loginUrl = new URL("/login", req.url);
			loginUrl.searchParams.set("callbackUrl", pathname);
			return NextResponse.redirect(loginUrl);
		}
	}

	if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
		if (session?.user) {
			return NextResponse.redirect(new URL("/dashboard", req.url));
		}
	}

	return NextResponse.next();
});

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico|public).*)"],
};
