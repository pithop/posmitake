'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useVoipStore } from '../store/useVoipStore';
import { useWebRTC, initSharedAudio } from '../hooks/useWebRTC';
import { useSystemStore } from '../store/useStore';
import { Mic, PhoneCall, Phone, PhoneOff, Radio, PhoneIncoming, AlertTriangle, Wifi, WifiOff, Loader2 } from 'lucide-react';

export const WalkieTalkieModule = () => {
    const deviceId = useSystemStore((state) => state.deviceId);
    const terminalId = deviceId || 'inconnu';
    const defaultTarget = deviceId === 'tablette' ? 'caisse_ordi' : 'tablette';

    const { phase, isMuted, targetId, setIsMuted } = useVoipStore();
    const { initiateCall, acceptCall, stopCall, remoteStream, errorMsg, clearError, iceState, wsStatus } = useWebRTC(terminalId);

    const [target, setTarget] = useState(defaultTarget);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCalling, setIsCalling] = useState(false); // protection anti double-clic

    useEffect(() => {
        setTarget(deviceId === 'tablette' ? 'caisse_ordi' : 'tablette');
    }, [deviceId]);

    useEffect(() => {
        if (phase !== 'IDLE') {
            setIsExpanded(true);
        } else {
            // CRITIQUE : Ne PAS replier le widget immédiatement s'il y a un message d'erreur.
            // L'utilisateur DOIT voir l'erreur avant que le widget ne se ferme.
            if (errorMsg) {
                // Garder le widget ouvert 5 secondes pour lire l'erreur, puis fermer
                const t = setTimeout(() => {
                    setIsExpanded(false);
                    setIsCalling(false);
                }, 5000);
                return () => clearTimeout(t);
            }
            setIsExpanded(false);
            setIsCalling(false);
        }
    }, [phase, errorMsg]);

    const handlePushToTalkStart = () => setIsMuted(false);
    const handlePushToTalkEnd = () => setIsMuted(true);

    const handleCallClick = async () => {
        if (isCalling || wsStatus !== 'connected') return;
        setIsCalling(true);
        initSharedAudio();
        await initiateCall(target);
        // Si l'appel échoue immédiatement (pas de WS, etc.), on réactive le bouton
        // Le reset se fera aussi via le useEffect sur [phase] → IDLE
    };

    // ── Indicateur statut WS ─────────────────────────────────────────────────
    const WsStatusBadge = () => {
        if (wsStatus === 'connected') return (
            <span title="Serveur connecté" className="flex items-center gap-1 text-xs text-emerald-400">
                <Wifi size={13} /> En ligne
            </span>
        );
        if (wsStatus === 'connecting') return (
            <span title="Connexion en cours..." className="flex items-center gap-1 text-xs text-yellow-400 animate-pulse">
                <Loader2 size={13} className="animate-spin" /> Connexion...
            </span>
        );
        return (
            <span title="Hors ligne — reconnexion auto en cours" className="flex items-center gap-1 text-xs text-red-400 animate-pulse">
                <WifiOff size={13} /> Hors ligne
            </span>
        );
    };

    // ── Bouton icône réduit (état IDLE + non étendu) ─────────────────────────
    if (!isExpanded && phase === 'IDLE') {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className="fixed bottom-28 left-6 h-16 w-16 bg-blue-600 hover:bg-blue-500 rounded-full shadow-[0_0_15px_rgba(37,99,235,0.5)] flex items-center justify-center text-white z-50 transition-transform active:scale-95"
                title="Talkie-Walkie"
            >
                <Radio size={28} />
                {/* Pastille statut réseau sur le bouton réduit */}
                <span className={`absolute top-1 right-1 h-3 w-3 rounded-full border-2 border-slate-900 ${
                    wsStatus === 'connected' ? 'bg-emerald-400' :
                    wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                    'bg-red-500 animate-pulse'
                }`} />
            </button>
        );
    }

    return (
        <div className="fixed bottom-28 left-6 bg-slate-900 border border-slate-700 text-white p-5 rounded-2xl shadow-2xl z-50 w-80 transition-all">
            {/* En-tête */}
            <h3 className="text-xl font-bold mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2">
                    <Radio className="text-blue-400" size={24} />
                    Walkie ({terminalId === 'tablette' ? 'Tab' : 'Caisse'})
                </span>
                {phase === 'TRANSMITTING' && <span className="h-4 w-4 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,1)]"></span>}
                {phase === 'CONNECTED' && <span className="h-4 w-4 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,1)]"></span>}
                {phase === 'RINGING' && <PhoneIncoming className="text-emerald-400 animate-pulse" size={20} />}
                {phase === 'SIGNALING' && <PhoneCall className="text-yellow-400 animate-bounce" size={20} />}
            </h3>

            {/* Statut connexion serveur */}
            <div className="mb-3">
                <WsStatusBadge />
            </div>

            {/* Message d'erreur */}
            {errorMsg && (
                <div className="bg-red-900/80 border border-red-500 text-white p-3 rounded-lg text-sm mb-4 relative shadow-lg">
                    <div className="flex gap-2 items-start">
                        <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                        <span>{errorMsg}</span>
                    </div>
                    <button onClick={clearError} className="absolute top-1 right-2 text-red-200 hover:text-white font-bold p-1">✕</button>
                </div>
            )}

            {/* Hors ligne warning */}
            {wsStatus !== 'connected' && phase === 'IDLE' && (
                <div className="bg-yellow-900/40 border border-yellow-700 text-yellow-300 p-2 rounded-lg text-xs mb-3 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Reconnexion automatique en cours... L'appel sera disponible dès la reconnexion.
                </div>
            )}

            {/* Infos statut */}
            <div className="text-sm mb-5 text-slate-400 bg-slate-800 p-2 rounded-lg">
                <div className="flex justify-between">
                    <span>Statut:</span>
                    <span className="font-mono text-emerald-400 capitalize">{phase.toLowerCase()}</span>
                </div>
                <div className="flex justify-between">
                    <span>Réseau (ICE):</span>
                    <span className={`font-mono ${iceState === 'connected' || iceState === 'completed' ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {iceState}
                    </span>
                </div>
                {targetId && (
                    <div className="flex justify-between mt-1">
                        <span>Contact:</span>
                        <span className="font-semibold text-blue-300">{targetId}</span>
                    </div>
                )}
            </div>

            {/* IDLE : bouton appeler */}
            {phase === 'IDLE' && (
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleCallClick}
                        disabled={isCalling || wsStatus !== 'connected'}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.4)] text-lg"
                    >
                        {isCalling
                            ? <><Loader2 size={20} className="animate-spin" /> Appel en cours...</>
                            : <><Phone size={20} /> Appeler {target === 'caisse_ordi' ? 'la Caisse' : 'la Tablette'}</>
                        }
                    </button>
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="w-full py-2 text-slate-400 hover:text-white transition-colors text-sm"
                    >
                        Fermer
                    </button>
                </div>
            )}

            {/* RINGING : appel entrant */}
            {phase === 'RINGING' && (
                <div className="flex flex-col gap-4">
                    <button
                        onClick={() => { initSharedAudio(); acceptCall(); }}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-6 rounded-xl text-xl font-bold transition-transform active:scale-95 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                    >
                        <PhoneIncoming size={28} className="animate-bounce" />
                        ACCEPTER L'APPEL
                    </button>
                    <button
                        onClick={stopCall}
                        className="w-full bg-red-950/50 text-red-500 border border-red-900/50 hover:bg-red-900 hover:text-white py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        <PhoneOff size={18} />
                        Refuser
                    </button>
                </div>
            )}

            {/* CONNECTED / TRANSMITTING : Push-To-Talk */}
            {(phase === 'CONNECTED' || phase === 'TRANSMITTING') && (
                <div className="flex flex-col gap-4">
                    <button
                        onMouseDown={handlePushToTalkStart}
                        onMouseUp={handlePushToTalkEnd}
                        onMouseLeave={handlePushToTalkEnd}
                        onTouchStart={handlePushToTalkStart}
                        onTouchEnd={handlePushToTalkEnd}
                        className={`py-12 px-4 rounded-xl font-bold text-2xl text-center transition-all select-none flex flex-col items-center justify-center gap-2 border ${
                            !isMuted
                            ? 'bg-red-600 border-red-500 shadow-[0_0_30px_rgba(220,38,38,0.8)] text-white scale-[1.02]'
                            : 'bg-slate-800 border-slate-600 hover:bg-slate-700 text-slate-300'
                        }`}
                    >
                        <Mic size={!isMuted ? 48 : 36} className={!isMuted ? 'animate-pulse text-white' : 'text-slate-400'} />
                        {!isMuted ? 'VOUS PARLEZ...' : 'MAINTENIR POUR PARLER'}
                    </button>
                    <button
                        onClick={stopCall}
                        className="w-full bg-red-950/50 text-red-500 border border-red-900/50 hover:bg-red-900 hover:text-white py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        <PhoneOff size={18} />
                        Raccrocher
                    </button>
                </div>
            )}

            {/* INITIALIZING / SIGNALING : appel en cours d'établissement */}
            {(phase === 'INITIALIZING' || phase === 'SIGNALING') && (
                <div className="flex flex-col gap-4">
                    <div className="py-12 bg-slate-800 rounded-xl flex items-center justify-center">
                        <span className="text-slate-300 animate-pulse flex items-center gap-2">
                            <PhoneCall size={24} />
                            Ça sonne en {targetId === 'cuisine' ? 'cuisine' : (terminalId === 'tablette' ? 'caisse' : 'tablette')}...
                        </span>
                    </div>
                    <button
                        onClick={stopCall}
                        className="w-full bg-red-950/50 text-red-500 border border-red-900/50 hover:bg-red-900 hover:text-white py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        <PhoneOff size={18} />
                        Annuler
                    </button>
                </div>
            )}
        </div>
    );
};
