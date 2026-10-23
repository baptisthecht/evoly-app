import { CoreError } from "@evoly/core";
import { requireOrgContext } from "@/server/context";
import { parseKitOptions, seatTestPagePdf } from "@/server/seatLabels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Kit d'installation de salle (section 9.33) : PDF A4, réservé au Pro. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string; eventId: string }> },
) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  try {
    const pdf = await seatTestPagePdf(
      ctx,
      eventId,
      parseKitOptions(new URL(req.url).searchParams),
    );
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="page-test.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof CoreError)
      return new Response(err.code, {
        status: err.code === "FEATURE_UNAVAILABLE" ? 403 : 400,
      });
    if (err instanceof Error && err.message === "LABEL_GRID_INVALID")
      return new Response("LABEL_GRID_INVALID", { status: 400 });
    throw err;
  }
}
