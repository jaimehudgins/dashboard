"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";

export default function Home() {
  return (
    <Sidebar>
      <AnalyticsDashboard />
    </Sidebar>
  );
}
