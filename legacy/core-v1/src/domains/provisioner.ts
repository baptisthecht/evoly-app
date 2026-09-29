// packages/core/domains/provisioner.ts
export async function provisionDomain(domain: string) {
	const res = await fetch(`${process.env.PROVISIONER_URL}/provision`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-secret": process.env.PROVISIONER_SECRET!,
		},
		body: JSON.stringify({ domain }),
	});
	if (!res.ok) throw new Error("Provisioner failed");
}

export async function deprovisionDomain(domain: string) {
	await fetch(`${process.env.PROVISIONER_URL}/provision/${domain}`, {
		method: "DELETE",
		headers: { "x-secret": process.env.PROVISIONER_SECRET! },
	});
}
