"use client";

export interface SeatData {
  id: string;
  label: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "BLOCKED";
  categoryId: string;
}

export interface RowData {
  id: string;
  name: string;
  categoryId: string;
  seats: SeatData[];
}

export interface CategoryData {
  id: string;
  name: string;
  color: string;
  ticketTypeId: string | null;
}

export interface SeatingMapData {
  id: string;
  categories: CategoryData[];
  rows: RowData[];
}

interface SeatPickerProps {
  seatingMap: SeatingMapData;
  /** Map of ticketTypeId → number of seats to pick */
  requiredByType: Record<string, number>;
  /** Map of ticketTypeId → selected seatIds */
  selectedByType: Record<string, string[]>;
  onChange: (selectedByType: Record<string, string[]>) => void;
  primaryColor: string;
}

export function SeatPicker({
  seatingMap,
  requiredByType,
  selectedByType,
  onChange,
  primaryColor,
}: SeatPickerProps) {
  // Build a lookup: categoryId → ticketTypeId (from categories)
  const categoryToTicketType: Record<string, string> = {};
  for (const cat of seatingMap.categories) {
    if (cat.ticketTypeId) categoryToTicketType[cat.id] = cat.ticketTypeId;
  }

  // Build a lookup: seatId → ticketTypeId (which type "owns" this seat's selection)
  function getTicketTypeForSeat(seat: SeatData): string | null {
    return categoryToTicketType[seat.categoryId] ?? null;
  }

  // Which seats are currently selected (flat set for quick lookup)
  const allSelectedIds = new Set(Object.values(selectedByType).flat());

  function handleSeatClick(seat: SeatData) {
    if (seat.status !== "AVAILABLE") return;

    const ttId = getTicketTypeForSeat(seat);
    if (!ttId) return; // seat's category not linked to any ticket type in cart

    const required = requiredByType[ttId] ?? 0;
    if (required === 0) return; // not in cart

    const currentSelected = selectedByType[ttId] ?? [];

    if (currentSelected.includes(seat.id)) {
      // Deselect
      onChange({
        ...selectedByType,
        [ttId]: currentSelected.filter((id) => id !== seat.id),
      });
    } else {
      // Select — only if below required count
      if (currentSelected.length >= required) return;
      onChange({
        ...selectedByType,
        [ttId]: [...currentSelected, seat.id],
      });
    }
  }

  // Check if selection is complete
  const totalRequired = Object.values(requiredByType).reduce((a, b) => a + b, 0);
  const totalSelected = Object.values(selectedByType).reduce((a, b) => a + b.length, 0);
  const isComplete = totalSelected === totalRequired;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {totalSelected} / {totalRequired} siège{totalRequired > 1 ? "s" : ""} sélectionné{totalSelected > 1 ? "s" : ""}
        </p>
        {isComplete && (
          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            ✓ Sélection complète
          </span>
        )}
      </div>

      {/* Per-category seat grids */}
      {seatingMap.categories.map((cat) => {
        const ttId = cat.ticketTypeId;
        const required = ttId ? (requiredByType[ttId] ?? 0) : 0;
        if (required === 0) return null; // category not in cart

        const catRows = seatingMap.rows.filter((r) => r.categoryId === cat.id);
        if (catRows.length === 0) return null;

        const currentSelected = ttId ? (selectedByType[ttId] ?? []) : [];

        return (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Category header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-sm font-semibold text-gray-800">{cat.name}</span>
              <span className="ml-auto text-xs text-gray-400">
                {currentSelected.length}/{required} choisi{required > 1 ? "s" : ""}
              </span>
            </div>

            {/* Stage indicator */}
            <div className="mx-4 mt-3 mb-2 h-1.5 rounded-full bg-gray-200 flex items-center justify-center relative">
              <span className="absolute text-[9px] text-gray-400 font-medium tracking-wider uppercase">Scène</span>
            </div>

            {/* Rows */}
            <div className="p-3 space-y-2 overflow-x-auto">
              {catRows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5 min-w-max">
                  <span className="text-[10px] font-mono font-bold text-gray-400 w-6 flex-shrink-0 text-right">
                    {row.name}
                  </span>
                  <div className="flex gap-1">
                    {row.seats.map((seat) => {
                      const isSelected = allSelectedIds.has(seat.id);
                      const thisTypeSelected = ttId ? (selectedByType[ttId] ?? []) : [];
                      const isSelectedByThisType = thisTypeSelected.includes(seat.id);
                      const isAvailable = seat.status === "AVAILABLE";
                      const canSelect = isAvailable && ttId && (
                        isSelectedByThisType || thisTypeSelected.length < required
                      );

                      let className =
                        "w-6 h-6 rounded text-[9px] font-medium transition-all flex-shrink-0 ";
                      let style: React.CSSProperties = {};

                      if (isSelectedByThisType) {
                        style = { backgroundColor: cat.color, color: "white" };
                        className += "ring-2 ring-offset-1 cursor-pointer";
                        (style as React.CSSProperties & Record<string, string>)["--tw-ring-color"] = cat.color;
                      } else if (!isAvailable || isSelected) {
                        // Unavailable or selected by another type
                        className += "cursor-not-allowed ";
                        if (seat.status === "SOLD") {
                          className += "bg-gray-400 text-gray-600";
                        } else if (seat.status === "BLOCKED") {
                          className += "bg-gray-300 text-gray-500";
                        } else if (seat.status === "RESERVED") {
                          className += "bg-yellow-200 text-yellow-600";
                        } else {
                          className += "bg-gray-400 text-gray-600";
                        }
                      } else if (canSelect) {
                        // Available and selectable
                        style = {
                          backgroundColor: `${cat.color}25`,
                          color: cat.color,
                          border: `1px solid ${cat.color}60`,
                        };
                        className += "cursor-pointer hover:opacity-80";
                      } else {
                        // Available but quota reached for this type
                        style = { backgroundColor: `${cat.color}10`, color: `${cat.color}60` };
                        className += "cursor-not-allowed opacity-50";
                      }

                      return (
                        <button
                          key={seat.id}
                          type="button"
                          className={className}
                          style={style}
                          title={`${seat.label}${!isAvailable ? ` — ${seat.status}` : ""}`}
                          onClick={() => isAvailable && handleSeatClick(seat)}
                          disabled={!isAvailable && !isSelectedByThisType}
                        >
                          {seat.label.replace(row.name, "")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400 pt-1">
        <span className="flex items-center gap-1">
          <span className="w-3.5 h-3.5 rounded inline-block border border-violet-300 bg-violet-50" />
          Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3.5 h-3.5 rounded inline-block bg-violet-600" />
          Sélectionné
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3.5 h-3.5 rounded inline-block bg-gray-400" />
          Occupé
        </span>
      </div>
    </div>
  );
}
