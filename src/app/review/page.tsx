'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import WeeklyReview from '@/components/WeeklyReview';

export default function ReviewPage() {
  return (
    <Sidebar>
      <WeeklyReview />
    </Sidebar>
  );
}
