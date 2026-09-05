"use client";

import { Building2, Loader2, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export interface TemuPartnerSelection {
  sender: { name: string; email: string };
  partners: Array<{ id: string; name: string; status: string | null }>;
  suggested_partner_id: string | null;
}

export default function TemuPartnerPickerModal({
  selection,
  loading,
  error,
  onSelect,
  onClose,
}: {
  selection: TemuPartnerSelection;
  loading: boolean;
  error: string | null;
  onSelect: (partnerId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const partners = useMemo(() => {
    const query = search.trim().toLowerCase();
    return selection.partners
      .filter((partner) => !query || partner.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (a.id === selection.suggested_partner_id) return -1;
        if (b.id === selection.suggested_partner_id) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [search, selection]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Building2 size={17} className="text-emerald-600" />
              Choose an existing TEMU partner
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Leo could not match this sender automatically. No new partner
              will be created.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-medium text-slate-800">
              {selection.sender.name}
            </p>
            <p className="text-xs text-slate-500">{selection.sender.email}</p>
          </div>

          <label className="relative block">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search existing partners…"
              autoFocus
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {partners.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No existing TEMU partner matches this search. Create the partner
              in TEMU first, then return to Leo.
            </div>
          ) : (
            <div className="space-y-2">
              {partners.map((partner) => {
                const suggested = partner.id === selection.suggested_partner_id;
                return (
                  <button
                    key={partner.id}
                    onClick={() => {
                      setSelectedPartnerId(partner.id);
                      onSelect(partner.id);
                    }}
                    disabled={loading}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                      suggested
                        ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium text-slate-800">
                        {partner.name}
                      </span>
                      {partner.status && (
                        <span className="block text-xs text-slate-500">
                          {partner.status}
                        </span>
                      )}
                    </span>
                    {loading && selectedPartnerId === partner.id ? (
                      <Loader2 size={15} className="animate-spin text-emerald-600" />
                    ) : suggested ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        Suggested
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4 text-xs text-slate-500">
          Partner creation remains TEMU-only. Selecting a partner here only
          continues the reviewed contact and touchpoint flow.
        </div>
      </div>
    </div>
  );
}
