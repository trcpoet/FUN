import { useEffect, useState } from "react";
import { getTotalUnreadCount, UNREAD_UPDATED_EVENT } from "../lib/unreadCounts";

/**
 * Returns the total unread message count across all game chats and DMs.
 * Updates automatically whenever any thread's unread count changes.
 */
export function useTotalUnreadMessages(): number {
  const [count, setCount] = useState(() => getTotalUnreadCount());

  useEffect(() => {
    const handler = () => setCount(getTotalUnreadCount());
    window.addEventListener(UNREAD_UPDATED_EVENT, handler);
    return () => window.removeEventListener(UNREAD_UPDATED_EVENT, handler);
  }, []);

  return count;
}
