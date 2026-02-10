import React from 'react';

export interface Player {
    id: string;
    name: string;
    avatarColor: string;
}

interface QueuePanelProps {
    queue: Player[];
    currentSpeaker: Player | null;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({ queue, currentSpeaker }) => {
    return (
        <aside className="cf-queue-panel">
            <h3 className="cf-queue-title">Sıra Listesi</h3>

            {currentSpeaker && (
                <div className="cf-queue-row speaking">
                    <span className="cf-queue-dot" style={{ background: currentSpeaker.avatarColor }} />
                    <span className="cf-queue-name">{currentSpeaker.name}</span>
                    <span className="cf-queue-badge">🔥 konuşuyor</span>
                </div>
            )}

            {queue.map((p, i) => (
                <div key={p.id} className="cf-queue-row">
                    <span className="cf-queue-idx">{i + 1}</span>
                    <span className="cf-queue-dot" style={{ background: p.avatarColor }} />
                    <span className="cf-queue-name">{p.name}</span>
                </div>
            ))}

            {queue.length === 0 && !currentSpeaker && (
                <p className="cf-queue-empty">Ateş sessiz…</p>
            )}
        </aside>
    );
};
