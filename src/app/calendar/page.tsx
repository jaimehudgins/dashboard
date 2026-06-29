'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import CharlieCalendar from '@/components/CharlieCalendar';

export default function CalendarPage() {
  return (
    <Sidebar>
      <CharlieCalendar />
    </Sidebar>
  );
}
