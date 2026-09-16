/**
 * Shared React hooks used across the app.
 */
import { useState, useEffect } from "react";

/**
 * Returns true when the viewport is narrower than `breakpoint` pixels.
 * Defaults to 768px (tablet/mobile breakpoint).
 */
export function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", fn, { passive: true });
    return () => window.removeEventListener("resize", fn);
  }, [breakpoint]);
  return mobile;
}
