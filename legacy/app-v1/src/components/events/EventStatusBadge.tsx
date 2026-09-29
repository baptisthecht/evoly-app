const STATUS_MAP = {
  DRAFT:     { label: "Brouillon",  classes: "bg-gray-100 text-gray-600" },
  PUBLISHED: { label: "Publié",     classes: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Annulé",     classes: "bg-red-100 text-red-600" },
  ENDED:     { label: "Terminé",    classes: "bg-blue-100 text-blue-600" },
};

export function EventStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status as keyof typeof STATUS_MAP] ?? STATUS_MAP.DRAFT;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.classes}`}>
      {s.label}
    </span>
  );
}
