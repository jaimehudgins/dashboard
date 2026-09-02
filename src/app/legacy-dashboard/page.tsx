"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";

export default function LegacyDashboardPage() {
  return (
    <Sidebar>
      <AnalyticsDashboard />
    </Sidebar>
  );
}
