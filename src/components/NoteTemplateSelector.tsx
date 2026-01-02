"use client";

import React from "react";
import {
  FileText,
  Users,
  Clipboard,
  ListTodo,
  Lightbulb,
  Calendar,
  X,
} from "lucide-react";

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  content: string;
}

const noteTemplates: NoteTemplate[] = [
  {
    id: "blank",
    name: "Blank Note",
    description: "Start with an empty note",
    icon: <FileText size={20} />,
    content: "",
  },
  {
    id: "meeting",
    name: "Meeting Notes",
    description: "Capture meeting discussions and action items",
    icon: <Users size={20} />,
    content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:**

---

## Agenda
-

## Discussion Points
-

## Action Items
- [ ]

## Next Steps
-

## Notes
`,
  },
  {
    id: "project-brief",
    name: "Project Brief",
    description: "Define project scope and objectives",
    icon: <Clipboard size={20} />,
    content: `# Project Brief

## Overview
Brief description of the project.

## Objectives
-

## Scope
### In Scope
-

### Out of Scope
-

## Timeline
| Milestone | Date |
|-----------|------|
|           |      |

## Stakeholders
-

## Success Criteria
-

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
|      |            |

## Resources
-
`,
  },
  {
    id: "sprint-planning",
    name: "Sprint Planning",
    description: "Plan sprint goals and tasks",
    icon: <ListTodo size={20} />,
    content: `# Sprint Planning

**Sprint:**
**Duration:**
**Sprint Goal:**

---

## Carried Over from Last Sprint
-

## New Items
-

## Sprint Backlog
| Task | Priority | Estimate | Assignee |
|------|----------|----------|----------|
|      |          |          |          |

## Capacity
-

## Dependencies
-

## Notes
`,
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    description: "Capture ideas and creative thinking",
    icon: <Lightbulb size={20} />,
    content: `# Brainstorm Session

**Topic:**
**Date:** ${new Date().toLocaleDateString()}

---

## Problem Statement


## Ideas
-

## Pros & Cons
| Idea | Pros | Cons |
|------|------|------|
|      |      |      |

## Selected Approach


## Next Steps
-
`,
  },
  {
    id: "weekly-review",
    name: "Weekly Review",
    description: "Review the week and plan ahead",
    icon: <Calendar size={20} />,
    content: `# Weekly Review

**Week of:** ${new Date().toLocaleDateString()}

---

## Accomplishments
-

## Challenges
-

## Learnings
-

## Next Week's Priorities
1.
2.
3.

## Tasks to Follow Up On
-

## Notes
`,
  },
];

interface NoteTemplateSelectorProps {
  onSelect: (template: NoteTemplate) => void;
  onClose: () => void;
}

export default function NoteTemplateSelector({
  onSelect,
  onClose,
}: NoteTemplateSelectorProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Choose a Template
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Templates Grid */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-2 gap-3">
            {noteTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className="flex items-start gap-3 p-4 text-left bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 hover:border-slate-300 transition-all group"
              >
                <div className="p-2 bg-white rounded-lg text-slate-500 group-hover:text-indigo-500 transition-colors">
                  {template.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                    {template.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { noteTemplates };
