import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/base.css';
import { SearchTemplatesApp } from '../../components/SearchTemplatesApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SearchTemplatesApp />
  </React.StrictMode>
);
