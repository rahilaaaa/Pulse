import { useEffect, useRef } from "react";

// Default: 15 minutes in milliseconds
const FIFTEEN_MINUTES_MS = 1 * 60 * 1000;

export function useInactivityLogout(
  onTimeout: () => void,
  timeoutMs: number = FIFTEEN_MINUTES_MS
) {
  const timerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const onTimeoutRef = useRef(onTimeout);

  // Keep latest callback reference
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    const handleLogout = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      onTimeoutRef.current();
    };

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(handleLogout, timeoutMs);
    };

    // Throttled activity handler so high-frequency events (mousemove/scroll) don't burden CPU
    let lastThrottledTime = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastThrottledTime > 5_000) {
        // Only reset at most once every 5 seconds
        lastThrottledTime = now;
        resetTimer();
      }
    };

    // When returning to tab or waking from laptop sleep, check if >15 minutes elapsed
    const handleVisibilityOrFocus = () => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        handleLogout();
      } else {
        resetTimer();
      }
    };

    const activityEvents = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    // Register interaction listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    window.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    // Start timer on mount
    resetTimer();

    // Cleanup listeners and timer on unmount
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [timeoutMs]);
}