import { MetadataRoute } from "next";
import { db } from "@evoly/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

	// Public published events
	const events = await db.event.findMany({
		where: { status: "PUBLISHED" },
		select: { slug: true, updatedAt: true },
		orderBy: { updatedAt: "desc" },
		take: 1000,
	});

	const eventUrls: MetadataRoute.Sitemap = events.map((event) => ({
		url: `${appUrl}/e/${event.slug}`,
		lastModified: event.updatedAt,
		changeFrequency: "daily",
		priority: 0.8,
	}));

	// Public org pages
	const orgs = await db.organization.findMany({
		select: { slug: true, updatedAt: true },
		orderBy: { updatedAt: "desc" },
		take: 500,
	});

	const orgUrls: MetadataRoute.Sitemap = orgs.map((org) => ({
		url: `${appUrl}/o/${org.slug}`,
		lastModified: org.updatedAt,
		changeFrequency: "weekly",
		priority: 0.6,
	}));

	return [...eventUrls, ...orgUrls];
}
