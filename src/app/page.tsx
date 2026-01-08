"use client";

import { MenuGrid } from '@/components/MenuGrid';
import { CartSidebar } from '@/components/CartSidebar';
import { AdminPanel } from '@/components/AdminPanel';
import menuData from '@/data/menu_data.json';
import { Product } from '@/types';
import { useSystemStore } from '@/store/useStore';
import { useEffect, useState } from 'react';
import { ShoppingBag, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Home() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const initializeSync = useSystemStore((state) => state.initializeSync);

  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-black text-white selection:bg-red-500/30">

      {/* Mobile Header (Only visible on small screens) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-md border-b border-white/10 z-50 flex items-center justify-between px-4">
        <div className="font-black text-lg tracking-tighter">
          MITAKE <span className="text-red-600">RAMEN</span>
        </div>
        <button
          onClick={() => setIsCartOpen(!isCartOpen)}
          className="p-2 bg-zinc-900 rounded-full text-white relative"
        >
          <ShoppingBag size={20} />
          {/* Dot indicator if items in cart could go here */}
        </button>
      </div>

      {/* Left Column: Menu (Flexible width) */}
      <div className="flex-1 h-full flex flex-col relative pt-16 lg:pt-0">
        <div className="hidden lg:flex items-center justify-between px-8 py-6 bg-transparent">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white">
              MITAKE <span className="text-red-600">RAMEN</span>
            </h1>
            <p className="text-zinc-500 text-sm font-medium tracking-wide mt-1">
              JAPANESE KITCHEN • POS SYSTEM
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-mono text-zinc-600">SYSTEM ONLINE</span>
          </div>
        </div>
        <MenuGrid />
      </div>

      {/* Right Column: Cart (Fixed width on desktop, Slide-over on mobile) */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-40 w-full sm:w-[400px] lg:w-[380px] lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none",
        isCartOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <CartSidebar />

        {/* Mobile Close Button */}
        <button
          onClick={() => setIsCartOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Overlay for mobile cart */}
      {isCartOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      <AdminPanel />
    </main>
  );
}
