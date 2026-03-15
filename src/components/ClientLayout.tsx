"use client";

import { useSystemStore } from "@/store/useStore";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logger } from "@/lib/logger";
import { OrderAlertManager } from "@/components/OrderAlertManager";
import { StockAlertManager } from "@/components/StockAlertManager";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { uiZoomLevel } = useSystemStore();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  useEffect(() => {
    setMounted(true);
    // Ensure logger picks up the device ID from the restored state
    const { deviceId } = useSystemStore.getState();
    if (deviceId) {
      logger.setDeviceId(deviceId);
    }
  }, []);

  // When unmounted during SSR, style defaults to CSS. 
  // Upon mount, it forces the user-defined native zoom!
  if (!mounted) return <>{children}</>;

  return (
    <>
      <style>{`
          html {
            font-size: ${(uiZoomLevel / 100) * 14}px !important;
          }
          @media (min-width: 1024px) {
            html {
              font-size: ${(uiZoomLevel / 100) * 10}px !important;
            }
          }
          @media (min-width: 1920px) {
            html {
              font-size: ${(uiZoomLevel / 100) * 14}px !important;
            }
          }
      `}</style>
      {/* Conditionally render global managers so they don't appear on the dashboard */}
      {!isDashboard && (
        <>
          <OrderAlertManager />
          <StockAlertManager />
        </>
      )}
      {children}
    </>
  );
}
