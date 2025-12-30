'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import DailySummary from '@/components/DailySummary';

export default function ArchivePage() {
  return (
    <Sidebar>
      <DailySummary />
    </Sidebar>
  );
}
