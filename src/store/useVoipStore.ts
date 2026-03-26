import { create } from 'zustand';

export type VoipPhase = 'IDLE' | 'INITIALIZING' | 'SIGNALING' | 'RINGING' | 'CONNECTED' | 'TRANSMITTING' | 'TEARDOWN';

interface VoipState {
    phase: VoipPhase;
    targetId: string | null;
    isMuted: boolean;
    setPhase: (phase: VoipPhase) => void;
    setTargetId: (id: string | null) => void;
    setIsMuted: (isMuted: boolean) => void;
    reset: () => void;
}

export const useVoipStore = create<VoipState>((set) => ({
    phase: 'IDLE',
    targetId: null,
    // En Walkie-Talkie, on est en sourdine (mute) par défaut jusqu'au bouton PTT (Push-To-Talk)
    isMuted: true, 
    
    setPhase: (phase) => set({ phase }),
    setTargetId: (targetId) => set({ targetId }),
    setIsMuted: (isMuted) => set({ isMuted }),
    
    reset: () => set({ phase: 'IDLE', targetId: null, isMuted: true })
}));
