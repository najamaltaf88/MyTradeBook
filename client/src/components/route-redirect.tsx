import { useEffect } from "react";
import { useLocation } from "wouter";

/** Sends legacy / removed routes to a working screen. */
export function RouteRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to);
  }, [to, setLocation]);
  return null;
}
