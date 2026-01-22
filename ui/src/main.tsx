import React from 'react';
import ReactDOM from 'react-dom';
import { App } from './app';
import { store } from './app/store';
import { Provider } from 'react-redux';
import './index.css';
import { Radio } from './lib';


export async function initializeApi(): Promise<Radio> {
  const radio = await Radio.create();
  return radio;
}

initializeApi().then(radio => {
  window.radio = radio;

  ReactDOM.render(
    <React.StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </React.StrictMode>,
    document.getElementById('app')
  );

})
