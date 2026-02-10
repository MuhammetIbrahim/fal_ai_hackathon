import React, { useRef, useEffect } from 'react';

interface Transcript {
    id: string;
    speaker: 'me' | 'opponent';
    text: string;
}

interface TranscriptPanelProps {
    transcripts: Transcript[];
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ transcripts }) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts]);

    return (
        <div className="transcript-panel">
            {transcripts.map((t) => (
                <div key={t.id} className={`transcript-item ${t.speaker}`}>
                    <span className="transcript-label">{t.speaker === 'me' ? '(SEN)' : '(O)'}</span>
                    <p>{t.text}</p>
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
};
