"use client";

import React, { useState } from "react";
import { MessageSquare, Send, Trash2, Edit2, X, Check } from "lucide-react";
import { format } from "date-fns";
import { useApp } from "@/store/store";
import { Comment } from "@/types";

interface CommentSectionProps {
  taskId: string;
}

export default function CommentSection({ taskId }: CommentSectionProps) {
  const { state, dispatch, getTaskComments } = useApp();
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const comments = getTaskComments(taskId);

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const comment: Comment = {
      id: `comment-${Date.now()}`,
      taskId,
      content: newComment.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dispatch({ type: "ADD_COMMENT", payload: comment });
    setNewComment("");
  };

  const handleEditComment = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = (commentId: string) => {
    if (!editContent.trim()) return;

    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    dispatch({
      type: "UPDATE_COMMENT",
      payload: {
        ...comment,
        content: editContent.trim(),
        updatedAt: new Date(),
      },
    });

    setEditingId(null);
    setEditContent("");
  };

  const handleDeleteComment = (commentId: string) => {
    if (confirm("Delete this comment?")) {
      dispatch({ type: "DELETE_COMMENT", payload: commentId });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-slate-500" />
        <label className="text-sm text-slate-600">
          Comments ({comments.length})
        </label>
      </div>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-slate-50 rounded-lg p-3 group"
            >
              {editingId === comment.id ? (
                <div className="flex items-start gap-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleSaveEdit(comment.id)}
                      className="p-1 text-green-500 hover:bg-green-50 rounded transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditContent("");
                      }}
                      className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">
                      {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                      {comment.updatedAt &&
                        new Date(comment.updatedAt).getTime() !==
                          new Date(comment.createdAt).getTime() && (
                          <span className="ml-1">(edited)</span>
                        )}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditComment(comment)}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment form */}
      <form onSubmit={handleAddComment} className="flex items-start gap-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={2}
        />
        <button
          type="submit"
          disabled={!newComment.trim()}
          className="p-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
