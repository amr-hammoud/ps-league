import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { FreshnessProvider } from './lib/freshness.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <FreshnessProvider>
        <App />
      </FreshnessProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
