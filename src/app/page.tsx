"use client";

import { MenuGrid } from '@/components/MenuGrid';
import { CartSidebar } from '@/components/CartSidebar';
import { AdminPanel } from '@/components/AdminPanel';
import { useCartStore, useSystemStore } from '@/store/useStore';
import { useEffect, useState } from 'react';
import { ShoppingBag, Menu, Wifi, X, ChevronRight } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function Home() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { items, total } = useCartStore();
  // PowerSync is initialized via Provider in layout.tsx

  useEffect(() => {
    // No manual sync initialization needed
  }, []);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background text-foreground selection:bg-primary/30" suppressHydrationWarning>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 glass-strong z-50 flex items-center justify-between px-6 border-b border-white/5">
        <div className="font-heading font-black text-xl tracking-tighter">
          MITAKE <span className="text-primary">POS</span>
        </div>
        <button
          onClick={() => setIsCartOpen(!isCartOpen)}
          className="p-2.5 bg-secondary rounded-full text-foreground relative active:scale-95 transition-transform"
        >
          <ShoppingBag size={20} />
          {items.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {items.length}
            </span>
          )}
        </button>
      </div>

      {/* Left Column: Menu */}
      <div className="flex-1 h-full flex flex-col relative pt-16 lg:pt-0 transition-all duration-300">
        <div className="hidden lg:flex items-center justify-between px-8 py-6 bg-transparent">
          <div>
            <h1 className="text-3xl font-heading font-black tracking-tighter text-foreground">
              MITAKE <span className="text-primary">POS</span>
            </h1>
            <p className="text-muted-foreground text-xs font-bold tracking-widest mt-1 uppercase">
              Japanese Kitchen • System v2.0
            </p>
          </div>
          <div className="flex items-center space-x-3 px-4 py-2 rounded-full bg-secondary/50 border border-white/5">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-500 tracking-wider">ONLINE</span>
          </div>
        </div>
        <MenuGrid />
      </div>

      {/* Right Column: Desktop Cart (Fixed Sidebar) */}
      <div className="hidden lg:flex w-[300px] xl:w-[380px] 2xl:w-[400px] flex-none flex-col border-l border-white/5 bg-zinc-950/50 backdrop-blur-xl relative z-40">
        <CartSidebar />
      </div>

      {/* Mobile Cart Drawer (Overlay) */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] lg:hidden transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1) shadow-2xl bg-zinc-950/95 backdrop-blur-xl border-l border-white/5",
        isCartOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <CartSidebar />
        <button
          onClick={() => setIsCartOpen(false)}
          className="absolute top-5 right-5 p-2 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10 active:scale-90 transition-transform"
        >
          <X size={20} />
        </button>
      </div>

      {/* Overlay for mobile cart */}
      {isCartOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      {/* Mobile Floating Action Button (Only visible if >0 items and cart is closed) */}
      {!isCartOpen && items.length > 0 && (
        <div className="lg:hidden fixed bottom-6 left-6 right-6 z-40 animate-slide-up-fade">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 px-6 rounded-2xl flex items-center justify-between shadow-2xl active:scale-95 transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="bg-black/20 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                {items.length}
              </div>
              <span className="font-bold text-lg">Voir le panier</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-xl">{formatPrice(total)}</span>
              <ChevronRight size={24} className="opacity-50" />
            </div>
          </button>
        </div>
      )}

      <AdminPanel />
    </main>
  );
}
