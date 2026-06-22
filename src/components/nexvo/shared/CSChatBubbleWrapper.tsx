'use client';

import dynamic from 'next/dynamic';

const CSChatBubble = dynamic(
  () => import('@/components/nexvo/shared/CSChatBubble'),
  { ssr: false }
);

export default function CSChatBubbleWrapper() {
  return <CSChatBubble />;
}
