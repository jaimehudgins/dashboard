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
  Pencil,
  ListPlus,
  CalendarPlus,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import {
  crmSupabase,
  isCrmConfigured,
  CrmPartner,
} from "@/lib/crm-supabase";
import { useApp } from "@/store/store";
import { Task } from "@/types";

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
  partnerIds?: string[]; // CRM partners this trip is about
  calendarEventId?: string; // linked Google Calendar event
  calendarEventLink?: string;
}

type TripFields = Pick<Trip, "destination" | "start" | "end" | "notes">;

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
  const { dispatch } = useApp();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const addTrip = (t: TripFields) => {
    setTrips((prev) => [...prev, { ...t, id: uid(), packing: [] }]);
    setShowForm(false);
  };
  const updateTrip = (id: string, patch: Partial<Trip>) =>
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const deleteTrip = (id: string) =>
    setTrips((prev) => prev.filter((t) => t.id !== id));

  // Drop a prep task onto the main task list, due by the trip's start.
  const addPrepTask = (trip: Trip) => {
    const task: Task = {
      id: crypto.randomUUID(),
      title: `Prep for ${trip.destination} trip`,
      priority: "medium",
      status: "pending",
      projectId: null,
      dueDate: new Date(`${trip.start}T12:00:00`),
      createdAt: new Date(),
      focusMinutes: 0,
    };
    dispatch({ type: "ADD_TASK", payload: task });
  };

  // Create an all-day Google Calendar event spanning the trip and link it.
  const addToCalendar = async (trip: Trip) => {
    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Travel: ${trip.destination}`,
        allDay: true,
        start: trip.start,
        end: trip.end,
        location: trip.destination,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add to calendar");
    updateTrip(trip.id, {
      calendarEventId: data.event?.id,
      calendarEventLink: data.event?.htmlLink,
    });
  };

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
        <TripForm
          onSubmit={addTrip}
          onCancel={() => setShowForm(false)}
          submitLabel="Add trip"
        />
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

      {upcoming.map((trip) =>
        editingId === trip.id ? (
          <TripForm
            key={trip.id}
            initial={trip}
            submitLabel="Save changes"
            onSubmit={(values) => {
              updateTrip(trip.id, values);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <TripCard
            key={trip.id}
            trip={trip}
            partners={partners}
            onUpdate={updateTrip}
            onDelete={deleteTrip}
            onEdit={() => setEditingId(trip.id)}
            onAddPrepTask={() => addPrepTask(trip)}
            onAddToCalendar={() => addToCalendar(trip)}
          />
        ),
      )}

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
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: TripFields;
  onSubmit: (t: TripFields) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [destination, setDestination] = useState(initial?.destination || "");
  const [start, setStart] = useState(initial?.start || "");
  const [end, setEnd] = useState(initial?.end || "");
  const [notes, setNotes] = useState(initial?.notes || "");
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
            onSubmit({ destination: destination.trim(), start, end, notes: notes.trim() || undefined })
          }
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
        >
          {submitLabel}
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
  onEdit,
  onAddPrepTask,
  onAddToCalendar,
}: {
  trip: Trip;
  partners: CrmPartner[];
  onUpdate: (id: string, patch: Partial<Trip>) => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
  onAddPrepTask: () => void;
  onAddToCalendar: () => Promise<void>;
}) {
  const [newItem, setNewItem] = useState("");
  const [prepAdded, setPrepAdded] = useState(false);
  const [calBusy, setCalBusy] = useState(false);
  const [calError, setCalError] = useState(false);

  const handleAddToCalendar = async () => {
    setCalBusy(true);
    setCalError(false);
    try {
      await onAddToCalendar();
    } catch {
      setCalError(true);
    } finally {
      setCalBusy(false);
    }
  };

  const selected = useMemo(
    () => new Set(trip.partnerIds || []),
    [trip.partnerIds],
  );
  const togglePartner = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onUpdate(trip.id, { partnerIds: [...next] });
  };

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
        <div className="flex items-center gap-1 flex-shrink-0">
          {trip.calendarEventId ? (
            <a
              href={trip.calendarEventLink || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            >
              <CalendarCheck size={14} />
              On calendar
            </a>
          ) : (
            <button
              onClick={handleAddToCalendar}
              disabled={calBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-60 rounded-lg transition-colors"
            >
              {calBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CalendarPlus size={14} />
              )}
              {calError ? "Retry" : "Add to calendar"}
            </button>
          )}
          <button
            onClick={() => {
              onAddPrepTask();
              setPrepAdded(true);
            }}
            disabled={prepAdded}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:text-green-600 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            {prepAdded ? <Check size={14} /> : <ListPlus size={14} />}
            {prepAdded ? "Prep task added" : "Add prep task"}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Edit trip"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onDelete(trip.id)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Delete trip"
          >
            <Trash2 size={15} />
          </button>
        </div>
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

        {/* Partner briefings + selection */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Briefcase size={15} className="text-slate-400" />
            Partners in {cityToken(trip.destination) ? trip.destination : "the area"}
            {selected.size > 0 && (
              <span className="text-xs font-medium text-indigo-600">
                · {selected.size} tied
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mb-3 mt-0.5">
            Check the partners this trip is about.
          </p>
          {matches.length === 0 ? (
            <p className="text-sm text-slate-400">
              No CRM partners matched this city.
            </p>
          ) : (
            <div className="space-y-2">
              {matches.map((p) => {
                const isOn = selected.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`flex items-start gap-2.5 p-3 rounded-lg transition-colors ${
                      isOn
                        ? "bg-indigo-50 ring-1 ring-indigo-200"
                        : "bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <button
                      onClick={() => togglePartner(p.id)}
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isOn
                          ? "bg-indigo-500 border-indigo-500"
                          : "border-slate-300 hover:border-slate-400 bg-white"
                      }`}
                      aria-label={isOn ? "Untie from trip" : "Tie to trip"}
                    >
                      {isOn && <Check size={11} className="text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {p.name}
                        </span>
                        <a
                          href={CRM_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-300 hover:text-slate-500 flex-shrink-0"
                          aria-label="Open in CRM"
                        >
                          <ExternalLink size={13} />
                        </a>
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
                        {p.willow_staff_lead && (
                          <span>· {p.willow_staff_lead}</span>
                        )}
                      </div>
                      {p.summary && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {p.summary}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
