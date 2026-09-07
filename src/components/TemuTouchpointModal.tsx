"use client";

import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { readJsonResponse } from "@/lib/http";

export interface TemuTouchpointPreview {
  source: "email" | "meeting";
  available_google_urls: string[];
  existing_touchpoint: {
    id: string;
    syncedThrough: string | null;
    updatedAt: string | null;
    hasNewSourceContent: boolean;
  } | null;
  partner: { id: string; name: string };
  contact: { id: string; name: string } | null;
  suggested_contacts: Array<{
    source_external_id: string;
    source_created_at: string;
    source_metadata: Record<string, unknown>;
    name: string;
    email: string;
    role: string;
    is_primary_contact: boolean;
    selected: boolean;
  }>;
  data: {
    partner_id: string;
    source_external_id: string;
    source_created_at: string;
    source_metadata: Record<string, unknown>;
    contact_id?: string;
    date: string;
    author: string;
    title: string;
    notes: string;
    next_steps: string | null;
    type: "Email" | "Meeting";
  };
  suggested_tasks: Array<{
    source_external_id: string;
    task: string;
    owner: string;
    ownership: "jaime" | "partner" | "unknown";
    dueDate: string | null;
    sourceUrls: string[];
    selected: boolean;
  }>;
}

type SuggestedTask = TemuTouchpointPreview["suggested_tasks"][number];
type SuggestedContact = TemuTouchpointPreview["suggested_contacts"][number];

type ExportResult = {
  duplicate: boolean;
  updated: boolean;
  contactsRequested: number;
  contactsCreated: number;
  contactDuplicates: number;
  contactsExisting: number;
  tasksRequested: number;
  tasksCreated: number;
  taskDuplicates: number;
};

export default function TemuTouchpointModal({
  preview,
  onClose,
  onSaved,
}: {
  preview: TemuTouchpointPreview;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [title, setTitle] = useState(preview.data.title);
  const [date, setDate] = useState(preview.data.date);
  const [notes, setNotes] = useState(preview.data.notes);
  const [nextSteps, setNextSteps] = useState(preview.data.next_steps ?? "");
  const [tasks, setTasks] = useState<SuggestedTask[]>(preview.suggested_tasks);
  const [suggestedContacts, setSuggestedContacts] =
    useState<SuggestedContact[]>(preview.suggested_contacts);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(preview.data.title);
    setDate(preview.data.date);
    setNotes(preview.data.notes);
    setNextSteps(preview.data.next_steps ?? "");
    setTasks(preview.suggested_tasks);
    setSuggestedContacts(preview.suggested_contacts);
    setSaving(false);
    setResult(null);
    setError(null);
  }, [preview]);

  const updateTask = (index: number, patch: Partial<SuggestedTask>) => {
    setTasks((current) =>
      current.map((task, taskIndex) =>
        taskIndex === index ? { ...task, ...patch } : task,
      ),
    );
  };

  const updateSuggestedContact = (
    index: number,
    patch: Partial<SuggestedContact>,
  ) => {
    setSuggestedContacts((current) =>
      current.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, ...patch } : contact,
      ),
    );
  };

  const addTask = () => {
    setTasks((current) => [
      ...current,
      {
        source_external_id: `${preview.data.source_external_id}:task:manual:${crypto.randomUUID()}`,
        task: "",
        owner: preview.data.author || "Jaime",
        ownership: "jaime",
        dueDate: null,
        sourceUrls: [],
        selected: true,
      },
    ]);
  };

  const suggestedContactInvalid = suggestedContacts.some(
    (contact) =>
      contact.selected &&
      (!contact.name.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())),
  );

  const save = async () => {
    if (!title.trim() || !notes.trim() || !date) return;
    const selectedTasks = tasks.filter(
      (task) => task.selected && task.task.trim(),
    );
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/temu/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "touchpoints",
          confirmed: true,
          update_existing: Boolean(preview.existing_touchpoint),
          data: {
            ...preview.data,
            date,
            title: title.trim(),
            notes: notes.trim(),
            next_steps: nextSteps.trim() || null,
          },
          new_contacts: suggestedContacts
            .filter((contact) => contact.selected)
            .map((contact) => ({
              source_external_id: contact.source_external_id,
              source_created_at: contact.source_created_at,
              source_metadata: contact.source_metadata,
              name: contact.name.trim(),
              email: contact.email.trim().toLowerCase(),
              role: contact.role.trim() || null,
              is_primary_contact: contact.is_primary_contact,
            })),
          follow_up_tasks: selectedTasks.map((task) => ({
            source_external_id: task.source_external_id,
            task: task.task.trim(),
            owner: task.owner,
            ownership: task.ownership,
            due_date: task.dueDate || null,
            source_urls: task.sourceUrls,
          })),
        }),
      });
      const body = await readJsonResponse<{
        duplicate: boolean;
        updated: boolean;
        error: string;
        contacts: {
          requested: number;
          created: number;
          duplicates: number;
          existing: number;
        };
        follow_up_tasks: {
          requested: number;
          created: number;
          duplicates: number;
        };
      }>(response);
      if (!response.ok) {
        throw new Error(body.error || `TEMU export failed (${response.status})`);
      }
      setResult({
        duplicate: Boolean(body.duplicate),
        updated: Boolean(body.updated),
        contactsRequested: body.contacts?.requested ?? 0,
        contactsCreated: body.contacts?.created ?? 0,
        contactDuplicates: body.contacts?.duplicates ?? 0,
        contactsExisting: body.contacts?.existing ?? 0,
        tasksRequested: body.follow_up_tasks?.requested ?? 0,
        tasksCreated: body.follow_up_tasks?.created ?? 0,
        taskDuplicates: body.follow_up_tasks?.duplicates ?? 0,
      });
      onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "TEMU export failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Building2 size={17} className="text-emerald-600" />
              {preview.existing_touchpoint ? "Update" : "Add"}{" "}
              {preview.data.type.toLowerCase()} in TEMU
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Review everything below. Nothing changes until you confirm.
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
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
            <p className="text-sm font-medium text-emerald-900">
              {preview.partner.name}
            </p>
            <p className="text-xs text-emerald-700">
              {preview.contact
                ? `Matched contact: ${preview.contact.name}`
                : "Partner matched; no existing contact was linked."}
            </p>
          </div>

          {preview.existing_touchpoint && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
              {preview.existing_touchpoint.hasNewSourceContent
                ? "This thread has new email since its last TEMU summary. Leo refreshed the summary; your confirmation will update the existing touchpoint."
                : "This thread is already in TEMU. Edit the summary below if needed; your confirmation will update the existing touchpoint rather than create a duplicate."}
            </div>
          )}

          {suggestedContacts.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-800">
                  New contacts found in this thread
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Leo excluded Willow staff and contacts already on this TEMU
                  partner. Select only the people you want to add.
                </p>
              </div>
              <div className="space-y-2">
                {suggestedContacts.map((contact, index) => (
                  <div
                    key={contact.source_external_id}
                    className={`rounded-lg border p-3 ${
                      contact.selected
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={contact.selected}
                        onChange={(event) =>
                          updateSuggestedContact(index, {
                            selected: event.target.checked,
                          })
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          Add {contact.name || contact.email} as a TEMU contact
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {contact.email}
                        </span>
                      </span>
                    </label>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium text-slate-600">
                        Name
                        <input
                          value={contact.name}
                          onChange={(event) =>
                            updateSuggestedContact(index, {
                              name: event.target.value,
                            })
                          }
                          disabled={!contact.selected}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Role (optional)
                        <input
                          value={contact.role}
                          onChange={(event) =>
                            updateSuggestedContact(index, {
                              role: event.target.value,
                            })
                          }
                          disabled={!contact.selected}
                          placeholder="e.g. School counselor"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </label>
                      <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                        Email
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(event) =>
                            updateSuggestedContact(index, {
                              email: event.target.value,
                            })
                          }
                          disabled={!contact.selected}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <label className="text-xs font-medium text-slate-600">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-slate-600">
            TEMU summary
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={7}
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Next steps
            <textarea
              value={nextSteps}
              onChange={(event) => setNextSteps(event.target.value)}
              rows={4}
              placeholder="No next steps identified"
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Tasks for Work
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Jaime-owned actions are selected automatically. Partner-owned
                  actions stay in the touchpoint unless you select them as waiting.
                </p>
              </div>
              <button
                type="button"
                onClick={addTask}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                <Plus size={13} />
                Add task
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-xs text-slate-500">
                Leo did not find a clear action to add to Work.
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task, index) => (
                  <div
                    key={task.source_external_id}
                    className={`rounded-lg border p-3 ${
                      task.selected
                        ? "border-indigo-200 bg-white"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={(event) =>
                          updateTask(index, { selected: event.target.checked })
                        }
                        className="mt-2 h-4 w-4 rounded border-slate-300 text-indigo-600"
                        aria-label={`Add ${task.task} to Work`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          value={task.task}
                          onChange={(event) =>
                            updateTask(index, { task: event.target.value })
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        {task.sourceUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {task.sourceUrls.map((url, urlIndex) => (
                              <span
                                key={url}
                                className="inline-flex items-center rounded-full bg-emerald-50 text-xs font-medium text-emerald-700"
                              >
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 py-1 pl-2 hover:text-emerald-900"
                                >
                                  <ExternalLink size={11} />
                                  Related Google file
                                  {task.sourceUrls.length > 1
                                    ? ` ${urlIndex + 1}`
                                    : ""}
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateTask(index, {
                                      sourceUrls: task.sourceUrls.filter(
                                        (sourceUrl) => sourceUrl !== url,
                                      ),
                                    })
                                  }
                                  className="p-1.5 text-emerald-500 hover:text-emerald-800"
                                  aria-label="Remove related Google file"
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        {preview.available_google_urls.some(
                          (url) => !task.sourceUrls.includes(url),
                        ) && (
                          <select
                            value=""
                            onChange={(event) => {
                              const url = event.target.value;
                              if (!url) return;
                              updateTask(index, {
                                sourceUrls: [...task.sourceUrls, url],
                              });
                            }}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                            aria-label={`Attach a Google file to ${task.task || "new task"}`}
                          >
                            <option value="">Attach a Google file…</option>
                            {preview.available_google_urls
                              .filter((url) => !task.sourceUrls.includes(url))
                              .map((url, urlIndex) => (
                                <option key={url} value={url}>
                                  Google file {urlIndex + 1}
                                </option>
                              ))}
                          </select>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={task.ownership}
                            onChange={(event) =>
                              updateTask(index, {
                                ownership: event.target
                                  .value as SuggestedTask["ownership"],
                              })
                            }
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              task.ownership === "jaime"
                                ? "bg-indigo-50 text-indigo-700"
                                : task.ownership === "partner"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <option value="jaime">Jaime owns</option>
                            <option value="partner">Partner owns</option>
                            <option value="unknown">Owner unclear</option>
                          </select>
                          {task.owner && (
                            <span className="text-xs text-slate-500">
                              {task.owner}
                            </span>
                          )}
                          <input
                            type="date"
                            value={task.dueDate ?? ""}
                            onChange={(event) =>
                              updateTask(index, {
                                dueDate: event.target.value || null,
                              })
                            }
                            className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                            aria-label={`Due date for ${task.task}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 size={16} />
              <span>
                {result.updated
                  ? "Touchpoint updated in TEMU."
                  : result.duplicate
                  ? "This touchpoint was already in TEMU."
                  : "Touchpoint added to TEMU."}
                {result.contactsRequested > 0 && (
                  <>
                    {" "}
                    {result.contactsCreated > 0
                      ? `${result.contactsCreated} contact${result.contactsCreated === 1 ? "" : "s"} added.`
                      : result.contactsExisting + result.contactDuplicates > 0
                        ? "Selected contacts were already in TEMU."
                        : "Contacts reviewed."}
                  </>
                )}
                {result.tasksRequested > 0 && (
                  <>
                    {" "}
                    {result.tasksCreated > 0
                      ? `${result.tasksCreated} task${result.tasksCreated === 1 ? "" : "s"} added to Work.`
                      : `${result.taskDuplicates} selected task${result.taskDuplicates === 1 ? " was" : "s were"} already there.`}
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-5">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={save}
              disabled={
                saving ||
                !title.trim() ||
                !notes.trim() ||
                !date ||
                suggestedContactInvalid
              }
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
              {saving
                ? preview.existing_touchpoint
                  ? "Updating…"
                  : "Adding…"
                : preview.existing_touchpoint
                  ? "Confirm update"
                  : "Confirm and add"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
