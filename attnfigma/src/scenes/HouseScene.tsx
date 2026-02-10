import React, { useState, useEffect } from 'react';
import { AvatarFrame } from '../components/house/AvatarFrame';
import { PTTButton } from '../components/house/PTTButton';
import { TranscriptPanel } from '../components/house/TranscriptPanel';

interface Transcript {
    id: string;
    speaker: 'me' | 'opponent';
    text: string;
}

export const HouseScene: React.FC = () => {
    const [turn, setTurn] = useState(1);
    const [maxTurns] = useState(8);
    const [currentSpeaker, setCurrentSpeaker] = useState<'me' | 'opponent'>('opponent'); // Opponent starts? Or Random.
    const [pttState, setPttState] = useState<'disabled' | 'ready' | 'talking' | 'processing'>('disabled');
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [micLevel, setMicLevel] = useState(0);

    // Initial Setup
    useEffect(() => {
        // Mock: Start game, maybe opponent speaks first
        if (currentSpeaker === 'opponent') {
            simulateOpponentTurn();
        } else {
            setPttState('ready');
        }
    }, []);

    const simulateOpponentTurn = () => {
        setPttState('disabled');
        setTimeout(() => {
            // Opponent "talking" visual
            setMicLevel(0.5); // Mock mic activity
        }, 1000);

        setTimeout(() => {
            // End opponent turn
            const text = "Karanlıkta ne gördün? (Mock Opponent Text)";
            addTranscript('opponent', text);
            setMicLevel(0);

            if (turn < maxTurns) {
                setTurn(prev => prev + 1);
                setCurrentSpeaker('me');
                setPttState('ready');
            }
        }, 4000);
    };

    const addTranscript = (speaker: 'me' | 'opponent', text: string) => {
        setTranscripts(prev => [...prev, {
            id: Date.now().toString(),
            speaker,
            text
        }]);
    };

    const handlePttDown = () => {
        if (pttState === 'ready') {
            setPttState('talking');
            // Start recording logic here
            // Mock mic level
            setInterval(() => {
                setMicLevel(Math.random());
            }, 100);
            // Save interval ID to clear later (simplified for MVP)
        }
    };

    const handlePttUp = () => {
        if (pttState === 'talking') {
            setPttState('processing');
            setMicLevel(0);
            // Stop recording
            // Mock processing delay
            setTimeout(() => {
                addTranscript('me', "Ocak yeminini tuttum... (Mock Speech)");

                if (turn < maxTurns) {
                    setTurn(prev => prev + 1);
                    setCurrentSpeaker('opponent');
                    simulateOpponentTurn();
                } else {
                    setPttState('disabled'); // Game Over
                }
            }, 1500);
        }
    };

    return (
        <div className="house-layout bg-black-20">
            {/* Header */}
            <div className="house-header">
                <div className="turn-badge">Tur: {turn} / {maxTurns}</div>
                <div className="status-text">
                    {currentSpeaker === 'me' ? 'Sıra Sende' : 'Dinle...'}
                </div>
            </div>

            {/* Avatars */}
            <AvatarFrame name="Yabancı (O)" align="left" isActive={currentSpeaker === 'opponent'} />
            <AvatarFrame name="Ben" align="right" isActive={currentSpeaker === 'me'} />

            {/* Center Visual (Voice Mask) */}
            <div className="center-visual">
                <div style={{
                    width: '100%', height: '100%', borderRadius: '50%',
                    background: `radial-gradient(circle, rgba(255,165,0,${micLevel}) 0%, transparent 70%)`,
                    transition: 'background 0.1s'
                }} />
            </div>

            {/* Transcript */}
            <TranscriptPanel transcripts={transcripts} />

            {/* PTT Control */}
            <PTTButton
                state={pttState}
                onDown={handlePttDown}
                onUp={handlePttUp}
            />
        </div>
    );
};
