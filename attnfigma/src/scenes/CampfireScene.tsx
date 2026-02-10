import React, { useState, useEffect, useCallback } from 'react';
import { ChatLog } from '../components/campfire/ChatLog';
import type { Message } from '../components/campfire/ChatLog';
import { InputArea } from '../components/campfire/InputArea';
import type { RaiseHandState } from '../components/campfire/InputArea';
import { QueuePanel } from '../components/campfire/QueuePanel';
import type { Player } from '../components/campfire/QueuePanel';
import { OmenBar } from '../components/campfire/OmenBar';

const SPEAK_TIME = 20; // seconds
const COOLDOWN_TIME = 3; // seconds

const MOCK_MESSAGES: Message[] = [
    { id: 'm1', sender: 'Ocak Bekçisi', text: 'Ocak Yemini titredi. Sözünü tart, geceyi dinle.', isSelf: false, isSystem: true, timestamp: 1 },
    { id: 'm2', sender: 'Gezgin', text: 'Ateşin gölgesinde bir şey kıpırdıyor. Duydunuz mu?', isSelf: false, timestamp: 2 },
    { id: 'm3', sender: 'Gölge', text: 'Ben bir şey duymadım. İlk geceyi sakin geçirmek lazım.', isSelf: false, timestamp: 3 },
    { id: 'm4', sender: 'Çoban', text: 'Gölge çok sakin. Bu sakinlik beni rahatsız ediyor.', isSelf: false, timestamp: 4 },
    { id: 'm5', sender: 'Ocak Bekçisi', text: 'Karanlık çöktü. İkinci tur başlıyor — sözlerinizi tartın.', isSelf: false, isSystem: true, timestamp: 5 },
    {
        id: 'm6', sender: 'Gezgin', text: 'Çoban haklı olabilir. Gölgenin gözleri tuhaf parlıyordu.', isSelf: false, timestamp: 6
    },
    { id: 'm7', sender: 'Derviş', text: 'Herkes herkesten şüpheleniyor. Bu ateşin işi böyle.', isSelf: false, timestamp: 7 },
    { id: 'm8', sender: 'Gölge', text: 'Benden şüphelenmek kolay. Ama asıl soruyu sorun: Kim susuyordu?', isSelf: false, timestamp: 8 },
];

const MOCK_QUEUE: Player[] = [
    { id: 'p1', name: 'Gezgin', avatarColor: '#8E44AD' },
    { id: 'p2', name: 'Gölge', avatarColor: '#2C3E50' },
    { id: 'p3', name: 'Çoban', avatarColor: '#E67E22' },
    { id: 'p4', name: 'Derviş', avatarColor: '#1ABC9C' },
];

export const CampfireScene: React.FC = () => {
    const MY_ID = 'me';
    const MY_NAME = 'Yabancı';

    const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
    const [queue, setQueue] = useState<Player[]>(MOCK_QUEUE);
    const [currentSpeaker, setCurrentSpeaker] = useState<Player | null>(null);
    const [handState, setHandState] = useState<RaiseHandState>('idle');
    const [queuePosition, setQueuePosition] = useState<number | undefined>(undefined);

    // Simulate the first speaker after a short delay
    useEffect(() => {
        const t = setTimeout(() => {
            if (queue.length > 0) {
                setCurrentSpeaker(queue[0]);
                setQueue((q) => q.slice(1));
            }
        }, 2000);
        return () => clearTimeout(t);
    }, []);

    const handleRaiseHand = useCallback(() => {
        if (handState !== 'idle') return;

        setHandState('queued');
        const myPlayer: Player = { id: MY_ID, name: MY_NAME, avatarColor: '#D35400' };
        setQueue((prev) => {
            const next = [...prev, myPlayer];
            setQueuePosition(next.length);
            return next;
        });

        // If no current speaker, grant lock after a short delay
        if (!currentSpeaker) {
            setTimeout(() => {
                setQueue((prev) => prev.filter((p) => p.id !== MY_ID));
                setCurrentSpeaker(myPlayer);
                setHandState('speaking');
                setQueuePosition(undefined);
            }, 1200);
        }
    }, [handState, currentSpeaker]);

    const handleSend = useCallback(
        (text: string) => {
            const msg: Message = {
                id: Date.now().toString(),
                sender: MY_NAME,
                text,
                isSelf: true,
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, msg]);

            // Release lock
            setCurrentSpeaker(null);
            setHandState('cooldown');

            // Cooldown → idle
            setTimeout(() => {
                setHandState('idle');
                // Advance queue: grant next speaker
                setQueue((prev) => {
                    if (prev.length > 0) {
                        setCurrentSpeaker(prev[0]);
                        return prev.slice(1);
                    }
                    return prev;
                });
            }, COOLDOWN_TIME * 1000);
        },
        [],
    );

    return (
        <div className="cf-scene">
            {/* Atmosphere layers */}
            <div className="cf-glow" />
            <div className="cf-vignette" />
            <div className="cf-noise" />

            {/* Top bar */}
            <header className="cf-topbar">
                <div className="cf-world-brief">
                    <h2 className="cf-world-title">Ocak Yemini</h2>
                    <p className="cf-world-sub">Karanlık çöktü — ateş etrafında toplanın.</p>
                </div>
                <OmenBar />
            </header>

            {/* Main content */}
            <div className="cf-body">
                <div className="cf-center">
                    <ChatLog messages={messages} />
                    <InputArea
                        state={handState}
                        queuePosition={queuePosition}
                        speakTimer={SPEAK_TIME}
                        onRaiseHand={handleRaiseHand}
                        onSend={handleSend}
                    />
                </div>
                <QueuePanel
                    queue={queue.filter((p) => p.id !== currentSpeaker?.id)}
                    currentSpeaker={currentSpeaker}
                />
            </div>
        </div>
    );
};
