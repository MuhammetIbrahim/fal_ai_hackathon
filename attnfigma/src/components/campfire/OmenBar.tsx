import React from 'react';

const OMEN_ICONS = ['◆', '☽', '⚶'];

export const OmenBar: React.FC = () => {
    return (
        <div className="cf-omen-bar" title="Günün Alametleri">
            {OMEN_ICONS.map((icon, i) => (
                <span key={i} className="cf-omen-slot">{icon}</span>
            ))}
        </div>
    );
};
