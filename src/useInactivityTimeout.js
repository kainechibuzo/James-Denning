/**
 * useInactivityTimeout
 *
 * Logs the user out after a period of inactivity.
 * Uses localStorage to track the last-active timestamp so the timeout
 * survives page refreshes and background tabs.
 *
 * Returns:
 *   showWarning   – true when the warning modal should be shown
 *   secondsLeft   – countdown (seconds) until auto-logout
 *   stayLoggedIn  – call this when the user clicks "Stay Logged In"
 *   shouldLogout  – becomes true when time runs out; watch with useEffect
 */

import { useState, useEffect, useCallback } from 'react';

export const INACTIVITY_KEY = 'rgs_last_active';

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'touchmove', 'scroll', 'click',
];

export function useInactivityTimeout({
  active      = true,
  timeout     = 5 * 60 * 1000,  // 5 minutes total
  warningTime = 1 * 60 * 1000,  // show warning 1 minute before logout
} = {}) {
  const [showWarning,  setShowWarning]  = useState(false);
  const [secondsLeft,  setSecondsLeft]  = useState(Math.ceil(warningTime / 1000));
  const [shouldLogout, setShouldLogout] = useState(false);

  // Write current time to localStorage
  const stamp = useCallback(() => {
    try { localStorage.setItem(INACTIVITY_KEY, String(Date.now())); } catch {}
  }, []);

  // Called by the "Stay Logged In" button
  const stayLoggedIn = useCallback(() => {
    stamp();
    setShowWarning(false);
    setSecondsLeft(Math.ceil(warningTime / 1000));
    setShouldLogout(false);
  }, [stamp, warningTime]);

  useEffect(() => {
    if (!active) {
      setShowWarning(false);
      setShouldLogout(false);
      return;
    }

    // Mark as active right now
    stamp();

    // Any interaction resets the clock
    const handleActivity = () => stamp();
    ACTIVITY_EVENTS.forEach(e =>
      window.addEventListener(e, handleActivity, { passive: true })
    );

    // Check every second — gives a smooth countdown display
    const interval = setInterval(() => {
      const last      = parseInt(localStorage.getItem(INACTIVITY_KEY) || '0', 10);
      const elapsed   = Date.now() - last;
      const remaining = timeout - elapsed;

      if (remaining <= 0) {
        // Time's up
        setShouldLogout(true);
        setShowWarning(false);
      } else if (remaining <= warningTime) {
        // Inside warning window — show countdown
        setShowWarning(true);
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        // All clear
        setShowWarning(false);
        setSecondsLeft(Math.ceil(warningTime / 1000));
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(e =>
        window.removeEventListener(e, handleActivity)
      );
      clearInterval(interval);
    };
  }, [active, timeout, warningTime, stamp]);

  return { showWarning, secondsLeft, stayLoggedIn, shouldLogout };
}
