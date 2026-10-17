export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RG-POST-04 : messages d'erreur envoyés par les téléphones, gardés dans les journaux du serveur. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { logs?: unknown } | null;
  if (Array.isArray(body?.logs)) for (const l of body.logs.slice(0, 20)) console.warn("Apple Wallet :", String(l).slice(0, 500));
  return new Response(null, { status: 200 });
}
