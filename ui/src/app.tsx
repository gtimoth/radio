import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './app/hooks';
import { RadioController } from './components/RadioController';
import { handleUpdate } from './util';
import { Radio } from './lib';
import { ChatBox } from './components/ChatBox';
import { selectUpdate, setUpdate } from './features/ui/uiSlice';
import { LoginPage } from './components/LoginPage';



export function App() {
  const radio = window.radio;

  const dispatch = useAppDispatch();
  const update = useAppSelector(selectUpdate);

  const [focus, setFocus] = useState(true);
  const [unseenChanges, setUnseenChanges] = useState(0);


  useEffect(() => {
    window.addEventListener('focus', function (event) {
      setFocus(true);
      setUnseenChanges(0);
    });
    window.addEventListener('blur', function (event) {
      setFocus(false);
    });
  }, []);

  // initialize subscription
  useEffect(() => {
    radio.watchTenna(handleSub, dispatch)
  }, []);


  function handleSub(update: any) {
    dispatch(setUpdate(update));
  }

  useEffect(() => {
    if (!update) return;
    // wrap updates in this effect to get accurate usestate
    handleUpdate(update, radio, dispatch, true);
    //
    // set notif if got an update when not focused
    if (!focus) {
      setUnseenChanges(unseenChanges + 1);
    }

  }, [update]);

  useEffect(() => {
    if (unseenChanges === 0) {
      document.title = 'radio'
    } else {
      document.title = 'radio (' + unseenChanges + ')'
    }
  }, [unseenChanges])

  useEffect(() => {
    setInterval(() => {
      // heartbeat to detect presence
      radio.ping();
    }, 1000 * 30 * 6);
  }, []);


  const MemoizedRadioController = useMemo(() => React.memo(RadioController), []);
  const MemoizedChatBox = useMemo(() => React.memo(ChatBox), []);
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MemoizedRadioController />} />
        <Route path="/s/:station" element={<MemoizedRadioController />} />
        <Route path="/chat" element={<MemoizedChatBox />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </Router>
  );
}
