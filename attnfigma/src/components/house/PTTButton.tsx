import React from 'react';

interface PTTButtonProps {
    state: 'disabled' | 'ready' | 'talking' | 'processing';
    onDown: () => void;
    onUp: () => void;
}

export const PTTButton: React.FC<PTTButtonProps> = ({ state, onDown, onUp }) => {
    const isInteractive = state === 'ready' || state === 'talking';

    const getLabel = () => {
        switch (state) {
            case 'disabled': return 'Sıra Sende Değil';
            case 'ready': return 'Bas - Konuş';
            case 'talking': return 'Konuşuyorsun...';
            case 'processing': return '...';
        }
    };

    return (
        <div className="ptt-container">
            <button
                className={`btn-ptt ${state}`}
                onPointerDown={isInteractive ? onDown : undefined}
                onPointerUp={isInteractive ? onUp : undefined}
                onPointerLeave={isInteractive && state === 'talking' ? onUp : undefined}
                disabled={!isInteractive} // Disable unless talking to prevent stuck
            >
                <div className="ptt-inner">
                    <span className="ptt-icon">{state === 'talking' ? '🎙️' : '✋'}</span>
                    <span className="ptt-label">{getLabel()}</span>
                </div>
            </button>
        </div>
    );
};
