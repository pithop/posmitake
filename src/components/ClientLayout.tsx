"use client";

import { useSystemStore } from "@/store/useStore";
import { useEffect, useState } from "react";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { uiZoomLevel } = useSystemStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
      {children}
    </>
  );
}
