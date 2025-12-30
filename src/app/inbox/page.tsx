'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import InboxView from '@/components/InboxView';

export default function InboxPage() {
  return (
    <Sidebar>
      <InboxView />
    </Sidebar>
  );
}
