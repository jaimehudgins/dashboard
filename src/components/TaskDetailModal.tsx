"use client";

import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  ExternalLink,
  FileText,
  Focus,
  Folder,
  MapPin,
  MessageSquareText,
  Paperclip,
  Pencil,
  X,
} from "lucide-react";

import { Attachment, Comment } from "@/types";

interface TaskDetailModalProps {
  title: string;
  description?: string;
  link?: string;
  relatedLinks?: string[];
  dueDate: Date | null;
  status: string;
  priority?: string;
  area: string;
  projectName?: string;
  partnerName?: string;
  comments?: Comment[];
  attachments?: Attachment[];
  onClose: () => void;
  onEdit: () => void;
  onFocus?: () => void;
}

function linkLabel(url: string, fallback: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.includes("docs.google.com")) return "Google Drive file";
    if (hostname.includes("drive.google.com")) return "Google Drive file";
    if (hostname.includes("mail.google.com")) return "Gmail thread";
    return hostname;
  } catch {
    return fallback;
  }
}

function LinkedText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
        if (!part.startsWith("http://") && !part.startsWith("https://")) {
          return <React.Fragment key={index}>{part}</React.Fragment>;
        }
        const match = part.match(/^(.*?)([),.;!?]*)$/);
        const url = match?.[1] || part;
        const trailing = match?.[2] || "";
        return (
          <React.Fragment key={index}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800"
            >
              {url}
            </a>
            {trailing}
          </React.Fragment>
        );
      })}
    </p>
  );
}

export default function TaskDetailModal({
  title,
  description,
  link,
  relatedLinks = [],
  dueDate,
  status,
  priority,
  area,
  projectName,
  partnerName,
  comments = [],
  attachments = [],
  onClose,
  onEdit,
  onFocus,
}: TaskDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const links = useMemo(() => {
    const candidates = [
      ...(link ? [{ url: link, label: linkLabel(link, "Task link") }] : []),
      ...relatedLinks.map((url, index) => ({
        url,
        label: linkLabel(url, `Related file ${index + 1}`),
      })),
      ...attachments.map((attachment) => ({
        url: attachment.fileUrl,
        label: attachment.fileName,
      })),
    ];
    return candidates.filter(
      (candidate, index) =>
        candidates.findIndex((item) => item.url === candidate.url) === index,
    );
  }, [attachments, link, relatedLinks]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
          <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
            <FileText size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Task details
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
            {partnerName && (
              <p className="mt-1 text-sm text-slate-500">{partnerName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close task details"
          >
            <X size={19} />
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium capitalize text-slate-700">
              {status.replaceAll("_", " ")}
            </span>
            {priority && (
              <span className="rounded-full bg-amber-50 px-3 py-1 font-medium capitalize text-amber-700">
                {priority} priority
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
              <MapPin size={12} /> {area}
            </span>
            {projectName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700">
                <Folder size={12} /> {projectName}
              </span>
            )}
            {dueDate && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
                <Calendar size={12} />
                {dueDate.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes and context
            </h3>
            {description ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <LinkedText text={description} />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
                No notes have been added to this task.
              </p>
            )}
          </section>

          {links.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Paperclip size={13} /> Files and links
              </h3>
              <div className="space-y-2">
                {links.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <FileText size={16} className="text-indigo-500" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </section>
          )}

          {comments.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <MessageSquareText size={13} /> Comments
              </h3>
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <LinkedText text={comment.content} />
                    <p className="mt-2 text-xs text-slate-400">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Pencil size={15} /> Edit task
          </button>
          {onFocus && (
            <button
              onClick={onFocus}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Focus size={15} /> Focus on task
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
