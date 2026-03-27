import { useEffect, useRef, useCallback, useState } from 'react';
import { useVoipStore } from '../store/useVoipStore';

// ─────────────────────────────────────────────────────────────────────────────
// Audio distant — On utilise un élément <audio> HTML standard plutôt que la
// Web Audio API. C'est l'approche recommandée pour WebRTC car :
//  1. Fonctionne nativement sur Safari, iOS, Chrome, Firefox
//  2. Pas de problème de suspension de contexte audio
//  3. Volume géré par le système (pas de risque de silence silencieux)
// ─────────────────────────────────────────────────────────────────────────────
let remoteAudioEl: HTMLAudioElement | null = null;

const getAudioEl = (): HTMLAudioElement => {
    if (!remoteAudioEl) {
        remoteAudioEl = document.createElement('audio');
        remoteAudioEl.autoplay = true;
        (remoteAudioEl as any).playsInline = true; // attribut iOS WebKit (non dans les typedefs TS)
        remoteAudioEl.muted = false;
        // On attache l'élément au DOM pour garantir la lecture sur certains navigateurs
        remoteAudioEl.style.display = 'none';
        document.body.appendChild(remoteAudioEl);
    }
    return remoteAudioEl;
};

/**
 * DOIT être appelé depuis un geste utilisateur (click/touchstart).
 * Ça "débloque" la politique d'autoplay du navigateur pour la session entière.
 */
export const initSharedAudio = () => {
    const el = getAudioEl();
    // Un play() depuis un handler utilisateur déverrouille l'audio sur Safari/iOS
    el.play().catch(() => { /* Silencieux si pas de srcObject encore, c'est ok */ });
};

const playRemoteStream = (stream: MediaStream) => {
    const el = getAudioEl();
    el.srcObject = stream;
    el.play().catch(err => {
        console.warn('⚠️ Remote audio play() bloqué (peut nécessiter interaction):', err.name);
    });
};

const stopRemoteAudio = () => {
    if (remoteAudioEl) {
        remoteAudioEl.pause();
        remoteAudioEl.srcObject = null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sonnerie WebAudio (séparée du flux distant, courte durée, pas de contexte persistant)
// ─────────────────────────────────────────────────────────────────────────────
let ringtoneCtx: AudioContext | null = null;

const playRingTone = () => {
    try {
        // Réutiliser le même contexte pour ne pas dépasser la limite iOS (6 max)
        if (!ringtoneCtx || ringtoneCtx.state === 'closed') {
            ringtoneCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (ringtoneCtx.state === 'suspended') {
            ringtoneCtx.resume();
        }
        const osc1 = ringtoneCtx.createOscillator();
        const osc2 = ringtoneCtx.createOscillator();
        const gain = ringtoneCtx.createGain();

        osc1.type = 'sine'; osc1.frequency.setValueAtTime(1046.5, ringtoneCtx.currentTime);
        osc2.type = 'sine'; osc2.frequency.setValueAtTime(1318.51, ringtoneCtx.currentTime);
        gain.gain.setValueAtTime(0, ringtoneCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.4, ringtoneCtx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ringtoneCtx.currentTime + 1.2);

        osc1.connect(gain); osc2.connect(gain);
        gain.connect(ringtoneCtx.destination);
        osc1.start(); osc2.start();
        osc1.stop(ringtoneCtx.currentTime + 1.2);
        osc2.stop(ringtoneCtx.currentTime + 1.2);
    } catch (_) { /* Silencieux */ }
};

// ─────────────────────────────────────────────────────────────────────────────
// ICE / TURN servers
// ─────────────────────────────────────────────────────────────────────────────
const ICE_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // OpenRelay TURN (gratuit, fiable pour production petite échelle)
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
    ]
};

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

const getReconnectDelay = (attempt: number) =>
    Math.min(1000 * Math.pow(2, attempt), 30000);

// ─────────────────────────────────────────────────────────────────────────────
// Hook principal
// ─────────────────────────────────────────────────────────────────────────────
export const useWebRTC = (terminalId: string) => {
    const wsRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
    const shouldReconnect = useRef(true);

    const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const iceRecoveryTimer = useRef<NodeJS.Timeout | null>(null);
    const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const incomingOfferRef = useRef<any>(null);

    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [iceState, setIceState] = useState<string>('init');
    const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

    const { setPhase, setTargetId, setIsMuted, isMuted, targetId } = useVoipStore();
    const clearError = () => setErrorMsg(null);

    // ── Teardown complet ────────────────────────────────────────────────────
    const teardown = useCallback(() => {
        if (ringtoneIntervalRef.current) { clearInterval(ringtoneIntervalRef.current); ringtoneIntervalRef.current = null; }
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (iceRecoveryTimer.current) { clearTimeout(iceRecoveryTimer.current); iceRecoveryTimer.current = null; }

        incomingOfferRef.current = null;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        pendingCandidates.current = [];
        stopRemoteAudio();
        setRemoteStream(null);

        setPhase('IDLE');
        setTargetId(null);
        setIsMuted(true);
    }, [setPhase, setTargetId, setIsMuted]);

    // ── Gestion des erreurs ─────────────────────────────────────────────────
    const handleWebRTCError = useCallback((err: any) => {
        console.error('🎤 WebRTC/Mic error:', err.name, err.message);
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setErrorMsg("Aucun microphone détecté. Veuillez brancher un micro.");
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMsg("Accès micro refusé. Autorisez le micro dans les réglages du navigateur.");
        } else {
            setErrorMsg('Erreur : ' + err.message);
        }
        teardown();
    }, [teardown]);

    // ── Setup PeerConnection ─────────────────────────────────────────────────
    const setupPeerConnection = useCallback((target: string): RTCPeerConnection => {
        const pc = new RTCPeerConnection(ICE_CONFIG);
        peerConnectionRef.current = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate', target, candidate: e.candidate
                }));
            }
        };

        pc.ontrack = (e) => {
            console.log('🔊 Flux audio distant reçu, démarrage lecture');
            const stream = e.streams?.[0] ?? new MediaStream([e.track]);
            setRemoteStream(stream);
            playRemoteStream(stream);
            setPhase('CONNECTED');
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log('ICE →', state);
            setIceState(state);

            if (state === 'failed') {
                setErrorMsg("Connexion audio échouée (réseau strict). Essayez de relancer l'appel.");
                teardown();
            } else if (state === 'disconnected') {
                // Glitch réseau passager : on attend 5s avant d'abandonner
                iceRecoveryTimer.current = setTimeout(() => {
                    if (
                        peerConnectionRef.current &&
                        (peerConnectionRef.current.iceConnectionState === 'disconnected' ||
                         peerConnectionRef.current.iceConnectionState === 'failed')
                    ) {
                        setErrorMsg("Connexion audio perdue.");
                        teardown();
                    }
                }, 5000);
            } else if (state === 'connected' || state === 'completed') {
                if (iceRecoveryTimer.current) {
                    clearTimeout(iceRecoveryTimer.current);
                    iceRecoveryTimer.current = null;
                }
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('PC connection state →', pc.connectionState);
        };

        return pc;
    }, [teardown, setPhase]);

    // ── Reconnexion WS ──────────────────────────────────────────────────────
    const scheduleReconnect = useCallback((attempt: number) => {
        if (!shouldReconnect.current) return;
        const delay = getReconnectDelay(attempt);
        console.log(`🔄 Reconnexion WS dans ${delay / 1000}s (tentative ${attempt + 1})`);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
            reconnectAttempt.current += 1;
            connectWebSocket(); // eslint-disable-line
        }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const connectWebSocket = useCallback(() => {
        if (!terminalId || !shouldReconnect.current) return;

        const url = process.env.NEXT_PUBLIC_VOIP_WS_URL || 'ws://localhost:5000';
        console.log(`📡 WS connexion (tentative ${reconnectAttempt.current + 1}):`, url);
        setWsStatus('connecting');

        // Neutraliser l'ancien WS pour éviter les événements fantômes
        if (wsRef.current) {
            wsRef.current.onopen = null;
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.onmessage = null;
        }

        let ws: WebSocket;
        try { ws = new WebSocket(url); }
        catch (e) {
            console.error('WebSocket constructor failed:', e);
            scheduleReconnect(reconnectAttempt.current);
            return;
        }
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('✅ WS connecté');
            reconnectAttempt.current = 0;
            setWsStatus('connected');
            setErrorMsg(null);
            ws.send(JSON.stringify({ type: 'register', id: terminalId }));
        };

        ws.onclose = () => {
            // Ignorer si ce WS a déjà été remplacé
            if (wsRef.current !== ws) {
                console.log('👻 Ghost WS close ignoré');
                return;
            }
            console.log('🔌 WS fermé');
            setWsStatus('disconnected');
            if (useVoipStore.getState().phase !== 'IDLE') {
                setErrorMsg('Connexion perdue. La communication a été interrompue.');
                teardown();
            }
            scheduleReconnect(reconnectAttempt.current);
        };

        ws.onerror = (e) => {
            console.error('WS error:', e);
            // onclose sera appelé après, qui gérera la reconnexion
        };

        ws.onmessage = async (event) => {
            let data: any;
            try { data = JSON.parse(event.data); }
            catch { console.error('WS message invalide:', event.data); return; }

            switch (data.type) {
                case 'registered':
                    console.log(`🔖 Enregistré comme "${data.id}"`);
                    break;

                case 'offer':
                    console.log(`📞 Appel entrant de ${data.source}`);
                    pendingCandidates.current = [];
                    incomingOfferRef.current = data;
                    setTargetId(data.source);
                    setPhase('RINGING');
                    playRingTone();
                    ringtoneIntervalRef.current = setInterval(playRingTone, 2000);
                    break;

                case 'answer':
                    if (peerConnectionRef.current) {
                        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
                        try {
                            await peerConnectionRef.current.setRemoteDescription(
                                new RTCSessionDescription(data.answer)
                            );
                            pendingCandidates.current.forEach(c =>
                                peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c)).catch(console.error)
                            );
                            pendingCandidates.current = [];
                            // Ne pas forcer CONNECTED ici — ontrack le fera
                        } catch (e) {
                            console.error('Erreur setRemoteDescription (answer):', e);
                        }
                    }
                    break;

                case 'ice-candidate':
                    if (peerConnectionRef.current?.remoteDescription) {
                        peerConnectionRef.current.addIceCandidate(
                            new RTCIceCandidate(data.candidate)
                        ).catch(console.error);
                    } else {
                        pendingCandidates.current.push(data.candidate);
                    }
                    break;

                case 'bye':
                    console.log('👋 Raccrochage reçu');
                    teardown();
                    break;

                case 'peer-unavailable':
                    setErrorMsg(`Appareil "${data.target}" introuvable. Vérifie qu'il est connecté.`);
                    teardown();
                    break;

                case 'peer-disconnected':
                    if (data.peerId && data.peerId === useVoipStore.getState().targetId) {
                        setErrorMsg('Correspondant déconnecté.');
                        teardown();
                    }
                    break;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [terminalId, teardown, setPhase, setTargetId, scheduleReconnect]);

    // ── PTT : mute/unmute local audio track ────────────────────────────────
    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
            if (!isMuted && targetId) setPhase('TRANSMITTING');
            else if (isMuted && targetId) setPhase('CONNECTED');
        }
    }, [isMuted, targetId, setPhase]);

    // ── Initialisation au montage ───────────────────────────────────────────
    useEffect(() => {
        if (!terminalId) return;
        shouldReconnect.current = true;
        connectWebSocket();

        return () => {
            shouldReconnect.current = false;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.onopen = null;
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.onmessage = null;
                wsRef.current.close();
            }
            teardown();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [terminalId]);

    // ── Actions publiques ───────────────────────────────────────────────────
    const acceptCall = useCallback(async () => {
        const data = incomingOfferRef.current;
        if (!data || !wsRef.current) return;

        if (ringtoneIntervalRef.current) { clearInterval(ringtoneIntervalRef.current); ringtoneIntervalRef.current = null; }

        setErrorMsg(null);
        setPhase('SIGNALING');
        const pc = setupPeerConnection(data.source);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            // Tracks activés par défaut — l'utilisateur DOIT appuyer sur PTT pour parler
            stream.getAudioTracks().forEach(t => { t.enabled = false; });
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            pendingCandidates.current.forEach(c =>
                pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error)
            );
            pendingCandidates.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsRef.current!.send(JSON.stringify({ type: 'answer', target: data.source, answer }));
        } catch (err) {
            handleWebRTCError(err);
        }
    }, [setPhase, setupPeerConnection, handleWebRTCError]);

    const initiateCall = useCallback(async (target: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setErrorMsg("Pas de connexion serveur. Attends la reconnexion automatique.");
            return;
        }
        setErrorMsg(null);
        setTargetId(target);
        setPhase('INITIALIZING');

        // Timeout auto si pas de réponse en 30s
        callTimeoutRef.current = setTimeout(() => {
            if (['SIGNALING', 'INITIALIZING'].includes(useVoipStore.getState().phase)) {
                setErrorMsg("Pas de réponse après 30s. Appel annulé automatiquement.");
                stopCall(); // eslint-disable-line
            }
        }, 30000);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            // Tracks désactivés par défaut (PTT → on talk uniquement en maintenant)
            stream.getAudioTracks().forEach(t => { t.enabled = false; });

            const pc = setupPeerConnection(target);
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            setPhase('SIGNALING');
            wsRef.current!.send(JSON.stringify({ type: 'offer', target, offer }));
        } catch (err) {
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            handleWebRTCError(err);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTargetId, setPhase, setupPeerConnection, handleWebRTCError]);

    const stopCall = useCallback(() => {
        const currentTarget = useVoipStore.getState().targetId;
        if (wsRef.current?.readyState === WebSocket.OPEN && currentTarget) {
            wsRef.current.send(JSON.stringify({ type: 'bye', target: currentTarget }));
        }
        teardown();
    }, [teardown]);

    return { initiateCall, acceptCall, stopCall, remoteStream, errorMsg, clearError, iceState, wsStatus };
};
