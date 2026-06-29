'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import Travel from '@/components/Travel';

export default function TravelPage() {
  return (
    <Sidebar>
      <Travel />
    </Sidebar>
  );
}
