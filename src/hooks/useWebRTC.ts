import { useEffect, useRef, useCallback, useState } from 'react';
import { useVoipStore } from '../store/useVoipStore';

export const useWebRTC = (terminalId: string) => {
    const wsRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
    
    // Nouveaux états vitaux pour le debug UI
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const incomingOfferRef = useRef<any>(null);
    const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const { setPhase, setTargetId, setIsMuted, isMuted, targetId } = useVoipStore();

    const clearError = () => setErrorMsg(null);

    const teardown = useCallback(() => {
        if (ringtoneIntervalRef.current) {
            clearInterval(ringtoneIntervalRef.current);
            ringtoneIntervalRef.current = null;
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
        setRemoteStream(null);

        setPhase('IDLE');
        setTargetId(null);
        setIsMuted(true);
    }, [setPhase, setTargetId, setIsMuted]);

    useEffect(() => {
        if (!terminalId) return;

        // Assurez-vous que l'URL WS pointe bien vers votre backend DigitalOcean en prod
        const url = process.env.NEXT_PUBLIC_VOIP_WS_URL || 'ws://localhost:5000';
        console.log("📡 VoIP attempting connection to:", url);
        
        try {
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('✅ Connected to VoIP Signaling Server');
                ws.send(JSON.stringify({ type: 'register', id: terminalId }));
                setErrorMsg(null);
            };

            ws.onerror = (e) => {
                console.error("WebSocket error:", e);
                // On affiche pas l'erreur à chaque fois pour éviter le spam, le store gérera peut être la reconnexion
            };

            ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'offer') {
                    console.log(`📞 Incoming call from ${data.source}`);
                    pendingCandidates.current = []; // Purge vitale des vieux paquets avant décrochage
                    incomingOfferRef.current = data;
                    setTargetId(data.source);
                    setPhase('RINGING');

                    const playRing = () => {
                        try {
                            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                            const osc1 = audioCtx.createOscillator();
                            const osc2 = audioCtx.createOscillator();
                            const gain = audioCtx.createGain();

                            osc1.type = 'sine'; osc1.frequency.setValueAtTime(1046.50, audioCtx.currentTime);
                            osc2.type = 'sine'; osc2.frequency.setValueAtTime(1318.51, audioCtx.currentTime);

                            gain.gain.setValueAtTime(0, audioCtx.currentTime);
                            gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
                            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);

                            osc1.connect(gain); osc2.connect(gain);
                            gain.connect(audioCtx.destination);

                            osc1.start(); osc2.start();
                            osc1.stop(audioCtx.currentTime + 1.5); osc2.stop(audioCtx.currentTime + 1.5);
                        } catch(e) { }
                    };

                    playRing();
                    ringtoneIntervalRef.current = setInterval(playRing, 2000);

                } else if (data.type === 'answer') {
                    if (peerConnectionRef.current) {
                        try {
                            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                            pendingCandidates.current.forEach(c => peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
                            pendingCandidates.current = [];
                            setPhase('CONNECTED');
                        } catch(e) {
                            console.error("Failed setting remote answer:", e);
                        }
                    }
                } else if (data.type === 'ice-candidate') {
                    if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
                        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
                    } else {
                        // CRITIQUE : on stocke les candidats reçus PENDANT que ça sonne (avant le clic "Accepter")
                        pendingCandidates.current.push(data.candidate);
                    }
                } else if (data.type === 'bye') {
                    console.log('👋 Raccrochage reçu depuis le correspondant.');
                    teardown();
                }
            };
            
            return () => {
                ws.close();
                teardown();
            };
        } catch (e) {
            console.error("Failed to parse or connect WebSocket", e);
        }
    }, [terminalId, setPhase, setTargetId, teardown]);

    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                // DTX technique : on disable purement le track quand le bouton est laché
                track.enabled = !isMuted;
            });
            if (!isMuted && targetId) setPhase('TRANSMITTING');
            else if (isMuted && targetId) setPhase('CONNECTED');
        }
    }, [isMuted, targetId, setPhase]);

    const handleWebRTCError = (err: any) => {
        console.error('🎤 Mic access or WebRTC error:', err);
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setErrorMsg("Aucun microphone détecté sur cet appareil. Veuillez brancher un micro.");
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMsg("L'accès au microphone a été refusé par le navigateur.");
        } else {
            setErrorMsg("Erreur matérielle imprévue : " + err.message);
        }
        teardown();
    };

    const setupPeerConnection = (target: string) => {
        // Ajout d'un serveur TURN gratuit (OpenRelay) pour garantir 100% de connexion
        // même derrière un pare-feu strict (très commun sur les ordinateurs de caisse).
        const pc = new RTCPeerConnection({ 
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
        });
        peerConnectionRef.current = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'ice-candidate', target, candidate: e.candidate }));
            }
        };

        pc.ontrack = (e) => {
            if (e.streams && e.streams[0]) {
                console.log('🔊 P2P Stream received, locking remote stream state');
                setRemoteStream(e.streams[0]);
                setPhase('CONNECTED');
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("P2P ICE State changed to:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                setErrorMsg("La connexion directe a échoué (réseau strict ou pare-feu).");
                teardown();
            }
            // On ne crash plus sur 'disconnected' car c'est passager (ou causé par le raccrochage de l'autre)
        };

        return pc;
    };

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
            
            pendingCandidates.current.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
            pendingCandidates.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            wsRef.current.send(JSON.stringify({ type: 'answer', target: data.source, answer }));

        } catch (err) {
            handleWebRTCError(err);
        }
    }, [setPhase, teardown]);

    const initiateCall = useCallback(async (target: string) => {
        setErrorMsg(null);
        setTargetId(target);
        setPhase('INITIALIZING');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;

            const pc = setupPeerConnection(target);
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            setPhase('SIGNALING');
            if (wsRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'offer', target, offer }));
            }

        } catch (err) {
            handleWebRTCError(err);
        }
    }, [setTargetId, setPhase, teardown]);

    const stopCall = useCallback(() => {
        if (wsRef.current && targetId) {
            wsRef.current.send(JSON.stringify({ type: 'bye', target: targetId }));
        }
        teardown();
    }, [teardown, targetId]);

    return { initiateCall, acceptCall, stopCall, remoteStream, errorMsg, clearError };
};
