import React, { useState, useEffect } from 'react';

export type RaiseHandState = 'idle' | 'queued' | 'speaking' | 'cooldown';

interface InputAreaProps {
    state: RaiseHandState;
    queuePosition?: number;
    speakTimer?: number;
    onRaiseHand: () => void;
    onSend: (text: string) => void;
}

const STATE_CONFIG: Record<RaiseHandState, { label: string; icon: string; className: string }> = {
    idle: { label: 'Ateş İsterim', icon: '🔥', className: 'cf-btn idle' },
    queued: { label: 'Sıradasın', icon: '⏳', className: 'cf-btn queued' },
    speaking: { label: 'Söz Sende', icon: '🎙️', className: 'cf-btn speaking' },
    cooldown: { label: 'Soluklan…', icon: '❄️', className: 'cf-btn cooldown' },
};

export const InputArea: React.FC<InputAreaProps> = ({
    state,
    queuePosition,
    speakTimer,
    onRaiseHand,
    onSend,
}) => {
    const [text, setText] = useState('');
    const [timer, setTimer] = useState(speakTimer ?? 0);

    useEffect(() => {
        if (state === 'speaking' && speakTimer) {
            setTimer(speakTimer);
            const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000);
            return () => clearInterval(id);
        }
    }, [state, speakTimer]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (text.trim()) {
            onSend(text.trim());
            setText('');
        }
    };

    const cfg = STATE_CONFIG[state];

    if (state === 'speaking') {
        return (
            <div className="cf-input-area">
                <form onSubmit={handleSubmit} className="cf-input-form">
                    <input
                        className="cf-text-input"
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Sözlerin ateşe layık olsun…"
                        maxLength={200}
                        autoFocus
                    />
                    <button type="submit" className="cf-btn-send">Yaz</button>
                </form>
                <span className="cf-timer">{timer}s</span>
            </div>
        );
    }

    return (
        <div className="cf-input-area">
            <button
                className={cfg.className}
                onClick={state === 'idle' ? onRaiseHand : undefined}
                disabled={state !== 'idle'}
            >
                <span className="cf-btn-icon">{cfg.icon}</span>
                <span className="cf-btn-label">
                    {cfg.label}
                    {state === 'queued' && queuePosition != null && ` #${queuePosition}`}
                </span>
            </button>
        </div>
    );
};
