"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useSystemStore } from '@/store/useStore';
import { ShieldAlert, X, Lock, Check } from 'lucide-react';

const UNLOCK_PIN = '1234';

export function MaintenanceScreen() {
    const { setMaintenanceMode } = useSystemStore();
    const [clickCount, setClickCount] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState(false);
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Multi-click secret trigger on "404"
    const handleSecretClick = () => {
        const next = clickCount + 1;
        setClickCount(next);

        if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
        clickTimerRef.current = setTimeout(() => {
            setClickCount(0);
        }, 2500);

        if (next >= 5) {
            setClickCount(0);
            setShowModal(true);
            setEnteredPin('');
            setPinError(false);
        }
    };

    // Keyboard support for PIN entry when modal is open
    useEffect(() => {
        if (!showModal) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                if (enteredPin.length < 4) {
                    setEnteredPin(prev => prev + e.key);
                    setPinError(false);
                }
            } else if (e.key === 'Backspace') {
                setEnteredPin(prev => prev.slice(0, -1));
                setPinError(false);
            } else if (e.key === 'Enter') {
                handleValidatePin();
            } else if (e.key === 'Escape') {
                setShowModal(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showModal, enteredPin]);

    const handleKeypadPress = (val: string) => {
        setPinError(false);
        if (val === 'C') {
            setEnteredPin('');
        } else if (val === 'DEL') {
            setEnteredPin(prev => prev.slice(0, -1));
        } else {
            if (enteredPin.length < 4) {
                const nextPin = enteredPin + val;
                setEnteredPin(nextPin);
                if (nextPin.length === 4 && nextPin === UNLOCK_PIN) {
                    // Auto-unlock on 4th correct digit
                    setTimeout(() => {
                        setMaintenanceMode(false);
                    }, 150);
                }
            }
        }
    };

    const handleValidatePin = () => {
        if (enteredPin === UNLOCK_PIN) {
            setMaintenanceMode(false);
            setShowModal(false);
        } else {
            setPinError(true);
            setEnteredPin('');
        }
    };

    return (
        <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-[#000000] text-[#ededed] px-6 select-none font-sans overflow-hidden">
            {/* Realistic Next.js / Server Error Layout */}
            <div className="flex flex-col sm:flex-row items-center justify-center text-center sm:text-left max-w-xl">
                <h1
                    onClick={handleSecretClick}
                    className="text-5xl sm:text-6xl font-bold tracking-tight text-white sm:pr-8 sm:mr-8 sm:border-r border-zinc-800 pb-4 sm:pb-0 cursor-default active:opacity-90 transition-opacity"
                    title="404"
                >
                    404
                </h1>
                <div className="space-y-1.5">
                    <h2 className="text-xl sm:text-2xl font-semibold text-zinc-200">
                        Cette page est introuvable.
                    </h2>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                        Le service est temporairement indisponible. Le site est actuellement en cours de réparation et de maintenance technique.
                    </p>
                </div>
            </div>

            {/* Technical Diagnostic Details */}
            <div className="mt-12 pt-8 border-t border-zinc-900 text-[11px] text-zinc-600 font-mono text-center space-y-1 max-w-md">
                <p>Status: HTTP 404 Not Found (503 Service Unavailable)</p>
                <p>Host: posmitake.vercel.app • Module: KDS / POS Controller</p>
                <p className="text-zinc-700">ERR_MAINTENANCE_IN_PROGRESS • Contactez l&apos;administrateur</p>
            </div>

            {/* Hidden corner fallback trigger (double click) */}
            <div
                onDoubleClick={() => setShowModal(true)}
                className="fixed bottom-2 right-2 w-8 h-8 opacity-0 cursor-default"
                title="Admin secret trigger"
            />

            {/* Unlock PIN Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 text-white font-bold text-base">
                                <Lock size={18} className="text-emerald-400" />
                                Déverrouillage POS
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-xs text-zinc-400">
                            Entrez votre code PIN pour rétablir le système :
                        </p>

                        {/* PIN Dots Display */}
                        <div className="flex justify-center items-center gap-3 py-2">
                            {[0, 1, 2, 3].map((idx) => (
                                <div
                                    key={idx}
                                    className={`w-4 h-4 rounded-full border transition-all ${
                                        idx < enteredPin.length
                                            ? 'bg-emerald-400 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]'
                                            : 'border-zinc-700 bg-zinc-900'
                                    }`}
                                />
                            ))}
                        </div>

                        {pinError && (
                            <p className="text-xs text-red-400 font-medium animate-shake">
                                ❌ Code PIN incorrect
                            </p>
                        )}

                        {/* Touch-Friendly On-Screen Keypad */}
                        <div className="grid grid-cols-3 gap-2.5 pt-2">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'DEL'].map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleKeypadPress(key)}
                                    className={`py-3.5 rounded-xl font-bold text-lg transition-all active:scale-95 ${
                                        key === 'C' || key === 'DEL'
                                            ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white text-xs'
                                            : 'bg-zinc-900/90 text-white hover:bg-zinc-800 border border-zinc-800/80 shadow-sm'
                                    }`}
                                >
                                    {key === 'DEL' ? '⌫' : key}
                                </button>
                            ))}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="button"
                            onClick={handleValidatePin}
                            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Check size={18} />
                            Déverrouiller le système
                        </button>

                        <p className="text-[10px] text-zinc-600">
                            Code par défaut : 1234
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
