import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

	return {
		rules: [
			{
				userAgent: "*",
				allow: ["/e/", "/o/", "/tickets/"],
				disallow: ["/dashboard/", "/onboarding/", "/api/"],
			},
		],
		sitemap: `${appUrl}/sitemap.xml`,
	};
}
