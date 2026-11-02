import '../polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import '../globals.css';
import '../i18n/i18n';
import { RepositoryApp } from './repository-app';

ReactDOM.createRoot(document.getElementById('root')!).render(<RepositoryApp />);
