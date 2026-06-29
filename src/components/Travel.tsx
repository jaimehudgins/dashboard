"use client";

import React, { useState, useEffect, useMemo } from "react";
import { format, differenceInCalendarDays, startOfDay } from "date-fns";
import {
  Plane,
  Plus,
  Trash2,
  MapPin,
  Calendar,
  Check,
  Briefcase,
  ExternalLink,
  X,
} from "lucide-react";
import {
  crmSupabase,
  isCrmConfigured,
  CrmPartner,
} from "@/lib/crm-supabase";

const CRM_URL = "https://willow-crm-three.vercel.app";
const STORAGE_KEY = "leo.trips";

interface PackItem {
  id: string;
  text: string;
  done: boolean;
}
interface Trip {
  id: string;
  destination: string;
  start: string; // YYYY-MM-DD
  end: string;
  notes?: string;
  packing: PackItem[];
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;

function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Trip[]) : [];
  } catch {
    return [];
  }
}

function cityToken(destination: string): string {
  return destination.split(",")[0].trim().toLowerCase();
}

export default function Travel() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Load trips from localStorage once on mount.
  useEffect(() => {
    setTrips(loadTrips());
    setHydrated(true);
  }, []);

  // Persist whenever trips change (after hydration).
  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  }, [trips, hydrated]);

  // Pull partners from the CRM for destination briefings.
  useEffect(() => {
    if (!isCrmConfigured) return;
    let active = true;
    crmSupabase
      .from("partners")
      .select(
        "id, name, status, relationship_health, last_contact_date, city_state, district, willow_staff_lead, summary",
      )
      .then(({ data, error }) => {
        if (error) {
          console.warn("Could not load partners for travel:", error.message);
          return;
        }
        if (active && data) setPartners(data as CrmPartner[]);
      });
    return () => {
      active = false;
    };
  }, []);

  const { upcoming, past } = useMemo(() => {
    const today = startOfDay(new Date());
    const sorted = [...trips].sort((a, b) => a.start.localeCompare(b.start));
    return {
      upcoming: sorted.filter((t) => new Date(t.end) >= today),
      past: sorted.filter((t) => new Date(t.end) < today).reverse(),
    };
  }, [trips]);

  const addTrip = (t: Omit<Trip, "id" | "packing">) => {
    setTrips((prev) => [...prev, { ...t, id: uid(), packing: [] }]);
    setShowForm(false);
  };
  const updateTrip = (id: string, patch: Partial<Trip>) =>
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const deleteTrip = (id: string) =>
    setTrips((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-sky-50 rounded-xl flex items-center justify-center">
            <Plane className="text-sky-500" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Travel</h1>
            <p className="text-slate-500 text-sm">
              Trips, packing, and who to see while you&rsquo;re there.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <Plus size={16} />
          New trip
        </button>
      </div>

      {showForm && (
        <TripForm onAdd={addTrip} onCancel={() => setShowForm(false)} />
      )}

      {hydrated && upcoming.length === 0 && past.length === 0 && !showForm && (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-12 text-center">
          <Plane className="mx-auto text-slate-300 mb-3" size={40} />
          <h3 className="text-slate-900 font-medium mb-1">No trips yet</h3>
          <p className="text-sm text-slate-500">
            Add an upcoming trip to get a packing list and partner briefings for
            the destination.
          </p>
        </div>
      )}

      {upcoming.map((trip) => (
        <TripCard
          key={trip.id}
          trip={trip}
          partners={partners}
          onUpdate={updateTrip}
          onDelete={deleteTrip}
        />
      ))}

      {past.length > 0 && (
        <div className="pt-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Past trips
          </h2>
          <div className="space-y-3">
            {past.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm"
              >
                <MapPin size={15} className="text-slate-400" />
                <span className="font-medium text-slate-700">
                  {trip.destination}
                </span>
                <span className="text-slate-400">
                  {format(new Date(trip.start), "MMM d")} –{" "}
                  {format(new Date(trip.end), "MMM d, yyyy")}
                </span>
                <button
                  onClick={() => deleteTrip(trip.id)}
                  className="ml-auto text-slate-300 hover:text-red-500 transition-colors"
                  aria-label="Delete trip"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Trip form ------------------------------ */

function TripForm({
  onAdd,
  onCancel,
}: {
  onAdd: (t: Omit<Trip, "id" | "packing">) => void;
  onCancel: () => void;
}) {
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const valid = destination.trim() && start && end && end >= start;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Destination city
          </label>
          <input
            autoFocus
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Cincinnati"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Start
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            End
          </label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (hotel, purpose, …)"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() =>
            onAdd({ destination: destination.trim(), start, end, notes: notes.trim() || undefined })
          }
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
        >
          Add trip
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Trip card ------------------------------ */

function TripCard({
  trip,
  partners,
  onUpdate,
  onDelete,
}: {
  trip: Trip;
  partners: CrmPartner[];
  onUpdate: (id: string, patch: Partial<Trip>) => void;
  onDelete: (id: string) => void;
}) {
  const [newItem, setNewItem] = useState("");

  const daysUntil = differenceInCalendarDays(
    startOfDay(new Date(trip.start)),
    startOfDay(new Date()),
  );

  const matches = useMemo(() => {
    const token = cityToken(trip.destination);
    if (!token) return [];
    return partners.filter(
      (p) =>
        (p.city_state || "").toLowerCase().includes(token) ||
        (p.district || "").toLowerCase().includes(token),
    );
  }, [partners, trip.destination]);

  const addItem = () => {
    if (!newItem.trim()) return;
    onUpdate(trip.id, {
      packing: [
        ...trip.packing,
        { id: uid(), text: newItem.trim(), done: false },
      ],
    });
    setNewItem("");
  };
  const toggleItem = (id: string) =>
    onUpdate(trip.id, {
      packing: trip.packing.map((p) =>
        p.id === id ? { ...p, done: !p.done } : p,
      ),
    });
  const removeItem = (id: string) =>
    onUpdate(trip.id, { packing: trip.packing.filter((p) => p.id !== id) });

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Trip header */}
      <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-sky-500" />
            <h2 className="text-lg font-semibold text-slate-900">
              {trip.destination}
            </h2>
            {daysUntil > 0 && (
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                in {daysUntil} day{daysUntil === 1 ? "" : "s"}
              </span>
            )}
            {daysUntil <= 0 && (
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                in progress
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
            <Calendar size={13} />
            {format(new Date(trip.start), "EEE, MMM d")} –{" "}
            {format(new Date(trip.end), "EEE, MMM d, yyyy")}
          </div>
          {trip.notes && (
            <p className="text-sm text-slate-500 mt-1">{trip.notes}</p>
          )}
        </div>
        <button
          onClick={() => onDelete(trip.id)}
          className="text-slate-300 hover:text-red-500 transition-colors"
          aria-label="Delete trip"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* Packing checklist */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Briefcase size={15} className="text-slate-400" />
            Packing
          </h3>
          <div className="space-y-1 mb-3">
            {trip.packing.length === 0 && (
              <p className="text-sm text-slate-400">Nothing on the list yet.</p>
            )}
            {trip.packing.map((item) => (
              <div key={item.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => toggleItem(item.id)}
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    item.done
                      ? "bg-green-500 border-green-500"
                      : "border-slate-300 hover:border-slate-400"
                  }`}
                >
                  {item.done && <Check size={11} className="text-white" />}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    item.done
                      ? "text-slate-400 line-through"
                      : "text-slate-700"
                  }`}
                >
                  {item.text}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                  aria-label="Remove item"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Add an item…"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={addItem}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Add item"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Partner briefings */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Briefcase size={15} className="text-slate-400" />
            Partners in {cityToken(trip.destination) ? trip.destination : "the area"}
            {matches.length > 0 && (
              <span className="text-xs text-slate-400">({matches.length})</span>
            )}
          </h3>
          {matches.length === 0 ? (
            <p className="text-sm text-slate-400">
              No CRM partners matched this city.
            </p>
          ) : (
            <div className="space-y-2">
              {matches.map((p) => (
                <a
                  key={p.id}
                  href={CRM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {p.name}
                    </span>
                    <ExternalLink
                      size={13}
                      className="text-slate-300 group-hover:text-slate-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                    {p.status && <span>{p.status}</span>}
                    {p.relationship_health && (
                      <span>· {p.relationship_health}</span>
                    )}
                    {p.last_contact_date && (
                      <span>
                        · last contact{" "}
                        {format(new Date(p.last_contact_date), "MMM d")}
                      </span>
                    )}
                    {p.willow_staff_lead && <span>· {p.willow_staff_lead}</span>}
                  </div>
                  {p.summary && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {p.summary}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
