import React from 'react';
import { Outlet } from 'react-router-dom';

export const Layout: React.FC = () => {
    return (
        <div className="layout-container">
            {/* Fog Overlay Placeholder */}
            <div className="overlay-fog" />

            {/* Main Content Area */}
            <div className="main-content">
                <Outlet />
            </div>
        </div>
    );
};
