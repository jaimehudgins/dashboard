'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import EndOfDay from '@/components/EndOfDay';

export default function EodPage() {
  return (
    <Sidebar>
      <EndOfDay />
    </Sidebar>
  );
}
