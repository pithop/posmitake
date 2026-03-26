import { useEffect, useRef, useCallback } from 'react';
import { useVoipStore } from '../store/useVoipStore';

export const useWebRTC = (terminalId: string) => {
    const wsRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
    
    // Nouveaux refs pour la sonnerie manuelle
    const incomingOfferRef = useRef<any>(null);
    const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const { setPhase, setTargetId, setIsMuted, isMuted, targetId } = useVoipStore();

    const teardown = useCallback(() => {
        console.log('🛑 Initiating strict WebRTC teardown sequences...');
        
        if (ringtoneIntervalRef.current) {
            clearInterval(ringtoneIntervalRef.current);
            ringtoneIntervalRef.current = null;
        }
        incomingOfferRef.current = null;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                track.stop();
            });
        }
        if (audioElementRef.current) {
            audioElementRef.current.srcObject = null;
            audioElementRef.current.remove();
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        localStreamRef.current = null;
        peerConnectionRef.current = null;
        audioElementRef.current = null;
        pendingCandidates.current = [];

        setPhase('IDLE');
        setTargetId(null);
        setIsMuted(true);
    }, [setPhase, setTargetId, setIsMuted]);

    useEffect(() => {
        if (!terminalId) return;

        const url = process.env.NEXT_PUBLIC_VOIP_WS_URL || 'ws://localhost:5000';
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('✅ Connected to VoIP Signaling Server');
            ws.send(JSON.stringify({ type: 'register', id: terminalId }));
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'offer') {
                console.log(`📞 Incoming call from ${data.source}`);
                incomingOfferRef.current = data;
                setTargetId(data.source);
                setPhase('RINGING');

                const playRing = () => {
                    try {
                        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                        const osc1 = audioCtx.createOscillator();
                        const osc2 = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();

                        osc1.type = 'sine'; osc1.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6
                        osc2.type = 'sine'; osc2.frequency.setValueAtTime(1318.51, audioCtx.currentTime); // E6

                        gain.gain.setValueAtTime(0, audioCtx.currentTime);
                        gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
                        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);

                        osc1.connect(gain); osc2.connect(gain);
                        gain.connect(audioCtx.destination);

                        osc1.start(); osc2.start();
                        osc1.stop(audioCtx.currentTime + 1.5); osc2.stop(audioCtx.currentTime + 1.5);
                    } catch(e) { console.error('Ring sound failed', e); }
                };

                playRing();
                ringtoneIntervalRef.current = setInterval(playRing, 2000);

            } else if (data.type === 'answer') {
                if (peerConnectionRef.current) {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                    pendingCandidates.current.forEach(c => peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
                    pendingCandidates.current = [];
                    setPhase('CONNECTED');
                }
            } else if (data.type === 'ice-candidate') {
                if (peerConnectionRef.current) {
                    if (peerConnectionRef.current.remoteDescription) {
                        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
                    } else {
                        pendingCandidates.current.push(data.candidate);
                    }
                }
            }
        };

        return () => {
            ws.close();
            teardown();
        };
    }, [terminalId, setPhase, setTargetId, teardown]);

    // Handle Mute/Unmute for Push-to-Talk (DTX optimization emulation)
    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
            if (!isMuted && targetId) setPhase('TRANSMITTING');
            else if (isMuted && targetId) setPhase('CONNECTED');
        }
    }, [isMuted, targetId, setPhase]);

    const acceptCall = useCallback(async () => {
        const data = incomingOfferRef.current;
        if (!data || !wsRef.current) return;

        if (ringtoneIntervalRef.current) {
            clearInterval(ringtoneIntervalRef.current);
            ringtoneIntervalRef.current = null;
        }
        
        setPhase('SIGNALING');

        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peerConnectionRef.current = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'ice-candidate', target: data.source, candidate: e.candidate }));
            }
        };

        pc.ontrack = (e) => {
            const audio = new Audio();
            audio.autoplay = true;
            audio.srcObject = e.streams[0];
            audioElementRef.current = audio;
            setPhase('CONNECTED');
            console.log('🔊 Placed incoming stream into audio element...');
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            
            stream.getAudioTracks().forEach(track => { track.enabled = false; });
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            pendingCandidates.current.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
            pendingCandidates.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            wsRef.current.send(JSON.stringify({ type: 'answer', target: data.source, answer }));

        } catch (err) {
            console.error('🎤 Mic access denied on receive', err);
            teardown();
        }
    }, [setPhase, teardown]);

    const initiateCall = useCallback(async (target: string) => {
        setTargetId(target);
        setPhase('INITIALIZING');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            stream.getAudioTracks().forEach(track => { track.enabled = false; });

            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peerConnectionRef.current = pc;

            pc.onicecandidate = (e) => {
                if (e.candidate && wsRef.current) {
                    wsRef.current.send(JSON.stringify({ type: 'ice-candidate', target, candidate: e.candidate }));
                }
            };

            pc.ontrack = (e) => {
                const audio = new Audio();
                audio.autoplay = true;
                audio.srcObject = e.streams[0];
                audioElementRef.current = audio;
            };

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            setPhase('SIGNALING');
            if (wsRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'offer', target, offer }));
            }

        } catch (err) {
            console.error('Failed to initiate call:', err);
            teardown();
        }
    }, [setTargetId, setPhase, teardown]);

    const stopCall = useCallback(() => {
        teardown();
    }, [teardown]);

    return { initiateCall, acceptCall, stopCall };
};
