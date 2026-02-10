import React, { useRef, useEffect } from 'react';

export interface Message {
    id: string;
    sender: string;
    text: string;
    isSelf: boolean;
    isSystem?: boolean;
    timestamp: number;
}

interface ChatLogProps {
    messages: Message[];
}

export const ChatLog: React.FC<ChatLogProps> = ({ messages }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="cf-chat-log">
            {messages.map((msg) => (
                <div
                    key={msg.id}
                    className={`cf-bubble ${msg.isSystem ? 'system' : msg.isSelf ? 'self' : 'other'}`}
                >
                    <span className="cf-bubble-sender">{msg.sender}</span>
                    <p className="cf-bubble-text">{msg.text}</p>
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
};
