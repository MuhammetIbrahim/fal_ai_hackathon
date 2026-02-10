import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '../components/common/Layout';
import { CampfireScene } from '../scenes/CampfireScene';
import { HouseScene } from '../scenes/HouseScene';

export const SceneRouter: React.FC = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<Layout />}>
                    <Route path="/" element={<Navigate to="/campfire" replace />} />
                    <Route path="/campfire" element={<CampfireScene />} />
                    <Route path="/house" element={<HouseScene />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
};
