import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './App.css';

// No <StrictMode>: its dev-only double mount would create, destroy and
// re-create each spreadsheet instance, which the libraries don't expect.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
