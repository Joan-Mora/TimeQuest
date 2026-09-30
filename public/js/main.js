import { html, render } from './lib/html.js';
import { StudentApp } from './views/student.js';
import { ProjectorApp } from './views/projector.js';
import { ModeratorApp } from './views/moderator.js';
import { SpectatorApp } from './views/spectator.js';
import { Report } from './views/report.js';
import { Certificate } from './views/certificate.js';

const ROUTES = {
  '/': StudentApp,
  '/moderador': ModeratorApp,
  '/proyector': ProjectorApp,
  '/espectador': SpectatorApp,
  '/informe': Report,
  '/certificado': Certificate,
};

const path = location.pathname.replace(/\/+$/, '') || '/';
const App = ROUTES[path] ?? StudentApp;
render(html`<${App} />`, document.getElementById('app'));
