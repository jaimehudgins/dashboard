"use client";

import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Focus3Dashboard from "@/components/Focus3Dashboard";
import ZenMode from "@/components/ZenMode";
import { Task } from "@/types";

export default function Home() {
  const [focusTask, setFocusTask] = useState<Task | null>(null);

  return (
    <>
      <Sidebar>
        <Focus3Dashboard onStartFocus={setFocusTask} />
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
