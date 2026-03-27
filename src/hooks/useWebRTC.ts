import { useEffect, useRef, useCallback, useState } from 'react';
import { useVoipStore } from '../store/useVoipStore';

// ─────────────────────────────────────────────────────────────────────────────
// Web Audio API Singleton (contournement du blocage Audio sur Safari/iOS)
// ─────────────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let currentSource: MediaStreamAudioSourceNode | null = null;

export const initSharedAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

const playStreamWebAudio = (stream: MediaStream) => {
    initSharedAudio();
    if (audioCtx && gainNode) {
        if (currentSource) {
            currentSource.disconnect();
            currentSource = null;
        }
        currentSource = audioCtx.createMediaStreamSource(stream);
        currentSource.connect(gainNode);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook principal
// ─────────────────────────────────────────────────────────────────────────────
export type WsStatus = 'connecting' | 'connected' | 'disconnected';

const ICE_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

// Backoff exponentiel : 1s, 2s, 4s, 8s, 16s, 30s max
const getReconnectDelay = (attempt: number) =>
    Math.min(1000 * Math.pow(2, attempt), 30000);

export const useWebRTC = (terminalId: string) => {
    const wsRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

    // Reconnexion WS
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
    const shouldReconnect = useRef(true); // mis à false au unmount

    // Timeout appel sortant (30s sans réponse → annuler)
    const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Récupération ICE : 5s après 'disconnected' avant d'abandonner
    const iceRecoveryTimer = useRef<NodeJS.Timeout | null>(null);

    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [iceState, setIceState] = useState<string>('init');
    const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

    const incomingOfferRef = useRef<any>(null);
    const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const { setPhase, setTargetId, setIsMuted, isMuted, targetId } = useVoipStore();
    const clearError = () => setErrorMsg(null);

    // ── Teardown complet de la session P2P ──────────────────────────────────
    const teardown = useCallback(() => {
        // Annuler tous les timers actifs
        if (ringtoneIntervalRef.current) {
            clearInterval(ringtoneIntervalRef.current);
            ringtoneIntervalRef.current = null;
        }
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }
        if (iceRecoveryTimer.current) {
            clearTimeout(iceRecoveryTimer.current);
            iceRecoveryTimer.current = null;
        }

        incomingOfferRef.current = null;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        localStreamRef.current = null;
        peerConnectionRef.current = null;
        pendingCandidates.current = [];

        if (currentSource) {
            currentSource.disconnect();
            currentSource = null;
        }
        setRemoteStream(null);

        setPhase('IDLE');
        setTargetId(null);
        setIsMuted(true);
    }, [setPhase, setTargetId, setIsMuted]);

    // ── Connexion WebSocket (et reconnexion automatique) ────────────────────
    const connectWebSocket = useCallback(() => {
        if (!terminalId || !shouldReconnect.current) return;

        const url = process.env.NEXT_PUBLIC_VOIP_WS_URL || 'ws://localhost:5000';
        console.log(`📡 VoIP WS connecting (attempt ${reconnectAttempt.current + 1}):`, url);
        setWsStatus('connecting');

        // CRITIQUE : Neutraliser TOUS les handlers de l'ancien WebSocket AVANT de créer le nouveau.
        // Sans ça, si l'ancien ws reçoit un close frame (ex: depuis le serveur), son onclose
        // déclenche scheduleReconnect() → nouvelle connexion alors qu'une autre est déjà active.
        if (wsRef.current) {
            wsRef.current.onopen = null;
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.onmessage = null;
        }

        let ws: WebSocket;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            console.error('WebSocket constructor failed:', e);
            scheduleReconnect();
            return;
        }
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('✅ VoIP WS connected');
            reconnectAttempt.current = 0;
            setWsStatus('connected');
            setErrorMsg(null);
            ws.send(JSON.stringify({ type: 'register', id: terminalId }));
        };

        ws.onclose = () => {
            // CRITIQUE : Vérifier que c'est bien le WS actuel qui se ferme.
            // Si wsRef.current a déjà été remplacé par un nouveau WS, on ignore ce close
            // pour éviter qu'un vieux WS fantôme déclenche un teardown ou une reconnexion parasite.
            if (wsRef.current !== ws) {
                console.log('👻 Ghost WS close ignored (already replaced by newer connection)');
                return;
            }
            console.log('🔌 VoIP WS closed');
            setWsStatus('disconnected');
            // Si on était en communication, tear down proprement
            if (useVoipStore.getState().phase !== 'IDLE') {
                setErrorMsg('Connexion perdue. La communication a été interrompue.');
                teardown();
            }
            scheduleReconnect();
        };

        ws.onerror = (e) => {
            console.error('WebSocket error:', e);
            // onclose sera appelé immédiatement après, qui gérera la reconnexion
        };

        ws.onmessage = async (event) => {
            let data: any;
            try {
                data = JSON.parse(event.data);
            } catch {
                console.error('Failed to parse WS message:', event.data);
                return;
            }

            if (data.type === 'registered') {
                console.log(`🔖 Registered as "${data.id}"`);

            } else if (data.type === 'offer') {
                console.log(`📞 Incoming call from ${data.source}`);
                pendingCandidates.current = [];
                incomingOfferRef.current = data;
                setTargetId(data.source);
                setPhase('RINGING');
                playRingtone();

            } else if (data.type === 'answer') {
                if (peerConnectionRef.current) {
                    // Annuler le timeout d'appel sortant : la réponse est arrivée
                    if (callTimeoutRef.current) {
                        clearTimeout(callTimeoutRef.current);
                        callTimeoutRef.current = null;
                    }
                    try {
                        await peerConnectionRef.current.setRemoteDescription(
                            new RTCSessionDescription(data.answer)
                        );
                        pendingCandidates.current.forEach(c =>
                            peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c)).catch(console.error)
                        );
                        pendingCandidates.current = [];
                        setPhase('CONNECTED');
                    } catch (e) {
                        console.error('Failed setting remote answer:', e);
                    }
                }

            } else if (data.type === 'ice-candidate') {
                if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
                    peerConnectionRef.current.addIceCandidate(
                        new RTCIceCandidate(data.candidate)
                    ).catch(console.error);
                } else {
                    // Stockage des candidats reçus AVANT d'avoir accepté l'appel
                    pendingCandidates.current.push(data.candidate);
                }

            } else if (data.type === 'bye') {
                console.log('👋 Raccrochage reçu du correspondant.');
                teardown();

            } else if (data.type === 'peer-unavailable') {
                // Le destinataire n'est pas connecté au serveur
                console.warn(`⚠️ Peer unavailable: ${data.target}`);
                setErrorMsg(`Appareil "  ${data.target}" introuvable. Vérifiez qu'il est en ligne.`);
                teardown();

            } else if (data.type === 'peer-disconnected') {
                // Un peer s'est déconnecté : si on était en comm avec lui, raccrocher
                const currentTargetId = useVoipStore.getState().targetId;
                if (data.peerId && data.peerId === currentTargetId) {
                    console.log(`🔌 Correspondant ${data.peerId} déconnecté.`);
                    setErrorMsg('Le correspondant a perdu la connexion.');
                    teardown();
                }
            }
        };
    }, [terminalId, teardown, setPhase, setTargetId]);

    const scheduleReconnect = useCallback(() => {
        if (!shouldReconnect.current) return;
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        const delay = getReconnectDelay(reconnectAttempt.current);
        console.log(`🔄 Reconnexion WS dans ${delay / 1000}s...`);
        reconnectTimer.current = setTimeout(() => {
            reconnectAttempt.current += 1;
            connectWebSocket();
        }, delay);
    }, [connectWebSocket]);

    // ── Sonnerie WebAudio ───────────────────────────────────────────────────
    const playRingtone = () => {
        const playRing = () => {
            try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();
                osc1.type = 'sine'; osc1.frequency.setValueAtTime(1046.5, ctx.currentTime);
                osc2.type = 'sine'; osc2.frequency.setValueAtTime(1318.51, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
                osc1.connect(gain); osc2.connect(gain);
                gain.connect(ctx.destination);
                osc1.start(); osc2.start();
                osc1.stop(ctx.currentTime + 1.5); osc2.stop(ctx.currentTime + 1.5);
            } catch (_) {}
        };
        playRing();
        ringtoneIntervalRef.current = setInterval(playRing, 2000);
    };

    // ── Mise en place PeerConnection ────────────────────────────────────────
    const setupPeerConnection = useCallback((target: string): RTCPeerConnection => {
        const pc = new RTCPeerConnection(ICE_CONFIG);
        peerConnectionRef.current = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate', target, candidate: e.candidate
                }));
            }
        };

        pc.ontrack = (e) => {
            if (e.streams && e.streams[0]) {
                console.log('🔊 Flux P2P reçu');
                setRemoteStream(e.streams[0]);
                playStreamWebAudio(e.streams[0]);
                setPhase('CONNECTED');
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log('ICE state →', state);
            setIceState(state);

            if (state === 'failed') {
                setErrorMsg('La connexion audio a échoué (pare-feu strict ou réseau instable).');
                teardown();
            } else if (state === 'disconnected') {
                // Attendre 5s avant d'abandonner (peut être un glitch réseau temporaire)
                if (iceRecoveryTimer.current) clearTimeout(iceRecoveryTimer.current);
                iceRecoveryTimer.current = setTimeout(() => {
                    const currentState = pc.iceConnectionState;
                    if (currentState === 'disconnected' || currentState === 'failed') {
                        console.warn('ICE disconnected trop longtemps → teardown');
                        setErrorMsg('Connexion audio perdue.');
                        teardown();
                    }
                }, 5000);
            } else if (state === 'connected' || state === 'completed') {
                // Connexion rétablie : annuler le timer de récupération
                if (iceRecoveryTimer.current) {
                    clearTimeout(iceRecoveryTimer.current);
                    iceRecoveryTimer.current = null;
                }
            }
        };

        return pc;
    }, [teardown, setPhase]);

    // ── Gestion des erreurs Mic / MediaDevices ──────────────────────────────
    const handleWebRTCError = useCallback((err: any) => {
        console.error('🎤 Mic/WebRTC error:', err.name, err.message);
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setErrorMsg('Aucun microphone détecté. Veuillez brancher un micro.');
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMsg("Accès micro refusé. Autorisez le micro dans les paramètres du navigateur.");
        } else {
            setErrorMsg('Erreur inattendue : ' + err.message);
        }
        teardown();
    }, [teardown]);

    // ── Effets secondaires sur l'état mute (DTX Push-To-Talk) ──────────────
    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
            if (!isMuted && targetId) setPhase('TRANSMITTING');
            else if (isMuted && targetId) setPhase('CONNECTED');
        }
    }, [isMuted, targetId, setPhase]);

    // ── Initialisation WS au montage ────────────────────────────────────────
    useEffect(() => {
        if (!terminalId) return;
        shouldReconnect.current = true;
        connectWebSocket();

        return () => {
            shouldReconnect.current = false;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) wsRef.current.close();
            teardown();
        };
        // Dépendance volontairement limitée à terminalId pour éviter les boucles infinies
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [terminalId]);

    // ── Actions exposées ─────────────────────────────────────────────────────
    const acceptCall = useCallback(async () => {
        setErrorMsg(null);
        const data = incomingOfferRef.current;
        if (!data || !wsRef.current) return;

        if (ringtoneIntervalRef.current) {
            clearInterval(ringtoneIntervalRef.current);
            ringtoneIntervalRef.current = null;
        }

        setPhase('SIGNALING');
        const pc = setupPeerConnection(data.source);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            pendingCandidates.current.forEach(c =>
                pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error)
            );
            pendingCandidates.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsRef.current.send(JSON.stringify({ type: 'answer', target: data.source, answer }));
        } catch (err) {
            handleWebRTCError(err);
        }
    }, [setPhase, setupPeerConnection, handleWebRTCError]);

    const initiateCall = useCallback(async (target: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setErrorMsg("Pas de connexion au serveur. Veuillez attendre la reconnexion.");
            return;
        }
        setErrorMsg(null);
        setTargetId(target);
        setPhase('INITIALIZING');

        // Timeout de 30s si personne ne répond
        callTimeoutRef.current = setTimeout(() => {
            const currentPhase = useVoipStore.getState().phase;
            if (currentPhase === 'SIGNALING' || currentPhase === 'INITIALIZING') {
                console.warn('⏱️ Appel sans réponse après 30s → annulation');
                setErrorMsg("Pas de réponse. L'appel a été annulé automatiquement.");
                stopCall();
            }
        }, 30000);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
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
        const currentTargetId = useVoipStore.getState().targetId;
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentTargetId) {
            wsRef.current.send(JSON.stringify({ type: 'bye', target: currentTargetId }));
        }
        teardown();
    }, [teardown]);

    return { initiateCall, acceptCall, stopCall, remoteStream, errorMsg, clearError, iceState, wsStatus };
};
