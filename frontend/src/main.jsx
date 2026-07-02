import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Analytics from './pages/Analytics.jsx';
import Privacy from './pages/Privacy.jsx';

const path = window.location.pathname;
const Page = path === '/analytics' ? Analytics : path === '/privacy' ? Privacy : App;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>
);
