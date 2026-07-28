import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/base.css';
import { SearchTasksApp } from '../../components/SearchTasksApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SearchTasksApp />
  </React.StrictMode>
);
