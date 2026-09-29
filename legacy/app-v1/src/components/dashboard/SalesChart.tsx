"use client";

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useState } from "react";

interface DayData {
  date: string;       // "01/06"
  revenue: number;    // euros
  tickets: number;
}

interface Props {
  data: DayData[];
}

export function SalesChart({ data }: Props) {
  const [mode, setMode] = useState<"revenue" | "tickets">("revenue");

  const hasData = data.some(d => d.revenue > 0 || d.tickets > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Ventes — 30 derniers jours</h3>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setMode("revenue")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "revenue" ? "bg-white shadow text-gray-900" : "text-gray-500"
            }`}
          >
            Revenus
          </button>
          <button
            onClick={() => setMode("tickets")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "tickets" ? "bg-white shadow text-gray-900" : "text-gray-500"
            }`}
          >
            Tickets
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="h-44 flex items-center justify-center text-sm text-gray-400">
          Aucune vente sur cette période
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={mode === "revenue" ? (v) => `${v}€` : String}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "12px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
              formatter={(value: number) =>
                mode === "revenue" ? [`${value.toFixed(2)}€`, "Revenus"] : [value, "Tickets"]
              }
            />
            {mode === "revenue" ? (
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#7c3aed"
                strokeWidth={2}
                fill="url(#colorRevenue)"
                dot={false}
                activeDot={{ r: 4, fill: "#7c3aed" }}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="tickets"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#colorTickets)"
                dot={false}
                activeDot={{ r: 4, fill: "#06b6d4" }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
