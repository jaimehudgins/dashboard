"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ProjectView from "@/components/ProjectView";
import ZenMode from "@/components/ZenMode";
import { Task } from "@/types";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [focusTask, setFocusTask] = useState<Task | null>(null);

  return (
    <>
      <Sidebar>
        <ProjectView projectId={projectId} onStartFocus={setFocusTask} />
      </Sidebar>

      {focusTask && (
        <ZenMode
          task={focusTask}
          onClose={() => setFocusTask(null)}
          onSwitchTask={setFocusTask}
        />
      )}
    </>
  );
}
