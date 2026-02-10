import React from 'react';

interface AvatarFrameProps {
    name: string;
    align: 'left' | 'right';
    isActive: boolean;
}

export const AvatarFrame: React.FC<AvatarFrameProps> = ({ name, align, isActive }) => {
    return (
        <div className={`avatar-frame ${align} ${isActive ? 'active' : ''}`}>
            <div className="avatar-image-placeholder" />
            <div className="avatar-name">{name}</div>
        </div>
    );
};
