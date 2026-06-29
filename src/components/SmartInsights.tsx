"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Lightbulb,
  AlertCircle,
  Target,
  TrendingUp,
  Clock,
  Zap,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  HeartPulse,
  Plus,
  Check,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import { format, differenceInDays, startOfDay } from "date-fns";
import {
  crmSupabase,
  isCrmConfigured,
  CrmPartner,
  createPartnerFollowUp,
  fetchOpenFollowUpPartnerIds,
} from "@/lib/crm-supabase";

interface Insight {
  id: string;
  type:
    | "overdue"
    | "due_soon"
    | "stale"
    | "balance"
    | "momentum"
    | "partner_silent"
    | "partner_at_risk";
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  task?: Task;
  action?: string;
  partnerId?: string;
  partnerName?: string;
}

// Days since last contact before a partner is considered "gone quiet".
const PARTNER_SILENT_DAYS = 30;

interface SmartInsightsProps {
  onFocusTask?: (task: Task) => void;
}

export default function SmartInsights({ onFocusTask }: SmartInsightsProps) {
  const { state } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  const [openFollowUps, setOpenFollowUps] = useState<Set<string>>(new Set());
  const [createdFor, setCreatedFor] = useState<Set<string>>(new Set());
  const [creatingId, setCreatingId] = useState<string | null>(null);

  // Pull partner metadata + open follow-ups from the CRM for relationship-aware
  // insights and follow-up de-duplication.
  useEffect(() => {
    if (!isCrmConfigured) return;
    let active = true;
    crmSupabase
      .from("partners")
      .select("id, name, status, relationship_health, last_contact_date")
      .then(({ data, error }) => {
        if (error) {
          console.warn("Could not load CRM partners for insights:", error.message);
          return;
        }
        if (active && data) setPartners(data as CrmPartner[]);
      });
    fetchOpenFollowUpPartnerIds().then((ids) => {
      if (active) setOpenFollowUps(ids);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleCreateFollowUp = async (insight: Insight) => {
    if (!insight.partnerId || !insight.partnerName) return;
    setCreatingId(insight.partnerId);
    try {
      await createPartnerFollowUp({
        partnerId: insight.partnerId,
        partnerName: insight.partnerName,
        dueInDays: 2,
      });
      setCreatedFor((prev) => new Set(prev).add(insight.partnerId!));
    } catch (err) {
      console.error("Could not create follow-up task:", err);
    } finally {
      setCreatingId(null);
    }
  };

  const insights = useMemo(() => {
    const insights: Insight[] = [];
    const today = startOfDay(new Date());

    // Get active tasks (not completed)
    const activeTasks = state.tasks.filter(
      (t) => t.status !== "completed" && !t.parentTaskId
    );

    // 1. Overdue tasks
    const overdueTasks = activeTasks.filter((t) => {
      if (!t.dueDate) return false;
      const dueDate = startOfDay(new Date(t.dueDate));
      return dueDate < today;
    });

    if (overdueTasks.length > 0) {
      const task = overdueTasks[0]; // Most urgent
      const project = state.projects.find((p) => p.id === task.projectId);
      insights.push({
        id: `overdue-${task.id}`,
        type: "overdue",
        title: "Overdue Task Needs Attention",
        description: `"${task.title}" in ${project?.name || "Unknown"} was due ${format(new Date(task.dueDate!), "MMM d")}`,
        icon: <AlertCircle size={20} />,
        color: "text-red-600",
        bgColor: "bg-red-50 border-red-200",
        task,
        action: "Focus on this",
      });
    }

    // 2. High priority tasks due soon (next 3 days)
    const dueSoonTasks = activeTasks.filter((t) => {
      if (!t.dueDate) return false;
      const dueDate = startOfDay(new Date(t.dueDate));
      const daysUntil = differenceInDays(dueDate, today);
      return (
        daysUntil >= 0 &&
        daysUntil <= 3 &&
        (t.priority === "critical" || t.priority === "high")
      );
    });

    if (dueSoonTasks.length > 0) {
      const task = dueSoonTasks[0];
      const project = state.projects.find((p) => p.id === task.projectId);
      const daysUntil = differenceInDays(
        startOfDay(new Date(task.dueDate!)),
        today
      );
      insights.push({
        id: `due-soon-${task.id}`,
        type: "due_soon",
        title: "High Priority Task Due Soon",
        description: `"${task.title}" in ${project?.name || "Unknown"} is due ${daysUntil === 0 ? "today" : `in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`}`,
        icon: <Calendar size={20} />,
        color: "text-orange-600",
        bgColor: "bg-orange-50 border-orange-200",
        task,
        action: "Start now",
      });
    }

    // 3. Stale tasks (pending for 7+ days with no focus time)
    const staleTasks = activeTasks.filter((t) => {
      const daysSinceCreated = differenceInDays(
        today,
        startOfDay(new Date(t.createdAt))
      );
      return daysSinceCreated >= 7 && t.focusMinutes === 0 && t.status === "pending";
    });

    if (staleTasks.length > 0) {
      const task = staleTasks[0];
      const project = state.projects.find((p) => p.id === task.projectId);
      const daysSinceCreated = differenceInDays(
        today,
        startOfDay(new Date(task.createdAt))
      );
      insights.push({
        id: `stale-${task.id}`,
        type: "stale",
        title: "Task Needs Attention",
        description: `"${task.title}" in ${project?.name || "Unknown"} has been pending for ${daysSinceCreated} days with no progress`,
        icon: <Clock size={20} />,
        color: "text-yellow-600",
        bgColor: "bg-yellow-50 border-yellow-200",
        task,
        action: "Make progress",
      });
    }

    // 4. Work area balance suggestion
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentSessions = state.focusSessions.filter(
      (s) => new Date(s.startTime) >= weekAgo
    );

    const areaMinutes = new Map<string, number>();
    recentSessions.forEach((session) => {
      const task = state.tasks.find((t) => t.id === session.taskId);
      if (task?.areaId) {
        const current = areaMinutes.get(task.areaId) || 0;
        areaMinutes.set(task.areaId, current + session.minutes);
      }
    });

    // Find areas with tasks but no recent focus
    const neglectedAreas = state.areas.filter((a) => {
      const hasActiveTasks = activeTasks.some((t) => t.areaId === a.id);
      const recentMinutes = areaMinutes.get(a.id) || 0;
      return hasActiveTasks && recentMinutes === 0;
    });

    if (neglectedAreas.length > 0) {
      const area = neglectedAreas[0];
      const tasksInArea = activeTasks.filter((t) => t.areaId === area.id);
      insights.push({
        id: `balance-${area.id}`,
        type: "balance",
        title: "Area Needs Attention",
        description: `You have ${tasksInArea.length} task${tasksInArea.length > 1 ? "s" : ""} in ${area.name} with no focus this week`,
        icon: <TrendingUp size={20} />,
        color: "text-purple-600",
        bgColor: "bg-purple-50 border-purple-200",
        action: "Review tasks",
      });
    }

    // 5. Quick wins - low priority tasks that can build momentum
    const quickWins = activeTasks.filter(
      (t) => t.priority === "low" && !t.dueDate && t.focusMinutes === 0
    );

    if (quickWins.length >= 3 && insights.length < 3) {
      insights.push({
        id: "momentum-quick-wins",
        type: "momentum",
        title: "Build Momentum with Quick Wins",
        description: `You have ${quickWins.length} low-priority tasks that could be quick wins to build momentum`,
        icon: <Zap size={20} />,
        color: "text-indigo-600",
        bgColor: "bg-indigo-50 border-indigo-200",
        action: "View tasks",
      });
    }

    // 6. Partner has gone quiet (no contact in 30+ days)
    const silentPartners = partners
      .filter((p) => !!p.last_contact_date)
      .map((p) => ({
        partner: p,
        days: differenceInDays(today, startOfDay(new Date(p.last_contact_date!))),
      }))
      .filter((x) => x.days >= PARTNER_SILENT_DAYS)
      .sort((a, b) => b.days - a.days);

    if (silentPartners.length > 0) {
      const { partner, days } = silentPartners[0];
      const others = silentPartners.length - 1;
      insights.push({
        id: `partner-silent-${partner.id}`,
        type: "partner_silent",
        title: "Partner Has Gone Quiet",
        description: `${partner.name} hasn't been contacted in ${days} days${
          others > 0
            ? ` (and ${others} other${others > 1 ? "s" : ""} past ${PARTNER_SILENT_DAYS} days)`
            : ""
        }`,
        icon: <Users size={20} />,
        color: "text-sky-600",
        bgColor: "bg-sky-50 border-sky-200",
        partnerId: partner.id,
        partnerName: partner.name,
      });
    }

    // 7. Partner relationship flagged "Watch"
    const watchPartners = partners.filter(
      (p) => p.relationship_health === "Watch"
    );

    if (watchPartners.length > 0) {
      const partner = watchPartners[0];
      const others = watchPartners.length - 1;
      insights.push({
        id: `partner-watch-${partner.id}`,
        type: "partner_at_risk",
        title: "Partner Relationship Needs Attention",
        description: `${partner.name}${
          others > 0 ? ` and ${others} other${others > 1 ? "s" : ""}` : ""
        } flagged "Watch" — worth a check-in`,
        icon: <HeartPulse size={20} />,
        color: "text-rose-600",
        bgColor: "bg-rose-50 border-rose-200",
        partnerId: partner.id,
        partnerName: partner.name,
      });
    }

    // 8. General encouragement if no specific insights
    if (insights.length === 0) {
      insights.push({
        id: "general-encouragement",
        type: "momentum",
        title: "You're All Caught Up!",
        description: "No urgent tasks or issues detected. Great work staying on top of things!",
        icon: <Target size={20} />,
        color: "text-green-600",
        bgColor: "bg-green-50 border-green-200",
      });
    }

    return insights;
  }, [state.tasks, state.projects, state.focusSessions, state.areas, partners]);

  // Auto-rotate insights every 5 seconds
  useEffect(() => {
    if (!autoRotate || insights.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % insights.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRotate, insights.length]);

  const handlePrevious = () => {
    setAutoRotate(false);
    setCurrentIndex((prev) => (prev - 1 + insights.length) % insights.length);
  };

  const handleNext = () => {
    setAutoRotate(false);
    setCurrentIndex((prev) => (prev + 1) % insights.length);
  };

  const handleAction = () => {
    const insight = insights[currentIndex];
    if (insight.task && onFocusTask) {
      onFocusTask(insight.task);
    }
  };

  if (insights.length === 0) return null;

  const currentInsight = insights[currentIndex];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
          <Lightbulb className="text-indigo-500" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Smart Insights
          </h2>
          <p className="text-sm text-slate-500">
            AI-powered suggestions based on your work patterns
          </p>
        </div>
      </div>

      <div className="relative">
        <div
          className={`border-2 rounded-xl p-6 transition-all ${currentInsight.bgColor}`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${currentInsight.bgColor} ${currentInsight.color}`}
            >
              {currentInsight.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">
                {currentInsight.title}
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                {currentInsight.description}
              </p>
              {currentInsight.action && currentInsight.task && (
                <button
                  onClick={handleAction}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                    currentInsight.type === "overdue"
                      ? "bg-red-600 hover:bg-red-700"
                      : currentInsight.type === "due_soon"
                        ? "bg-orange-600 hover:bg-orange-700"
                        : currentInsight.type === "stale"
                          ? "bg-yellow-600 hover:bg-yellow-700"
                          : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {currentInsight.action}
                </button>
              )}

              {/* Partner follow-up action */}
              {currentInsight.partnerId &&
                (createdFor.has(currentInsight.partnerId) ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                    <Check size={16} />
                    Follow-up created
                  </span>
                ) : openFollowUps.has(currentInsight.partnerId) ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
                    <Check size={16} />
                    Follow-up already open
                  </span>
                ) : (
                  <button
                    onClick={() => handleCreateFollowUp(currentInsight)}
                    disabled={creatingId === currentInsight.partnerId}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-60 transition-colors"
                  >
                    <Plus size={16} />
                    {creatingId === currentInsight.partnerId
                      ? "Creating…"
                      : "Create follow-up task"}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Navigation */}
        {insights.length > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                aria-label="Previous insight"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNext}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                aria-label="Next insight"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {insights.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setCurrentIndex(index);
                    setAutoRotate(false);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentIndex
                      ? "bg-indigo-600 w-6"
                      : "bg-slate-300 hover:bg-slate-400"
                  }`}
                  aria-label={`Go to insight ${index + 1}`}
                />
              ))}
            </div>

            <div className="text-xs text-slate-500">
              {currentIndex + 1} / {insights.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
