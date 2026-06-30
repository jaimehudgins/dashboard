'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import LeoChat from '@/components/LeoChat';

export default function ChatPage() {
  return (
    <Sidebar>
      <LeoChat />
    </Sidebar>
  );
}
