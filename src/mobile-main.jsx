import React from 'react';
import ReactDOM from 'react-dom/client';
import '../src/styles/system.css';
import { MobileApp } from './MobileApp.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>
);
