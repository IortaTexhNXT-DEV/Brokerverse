import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';
import { installDemoApi } from './demo/mockApi';

if (import.meta.env.VITE_DEMO === 'true') installDemoApi();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
