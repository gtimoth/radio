import { Radio } from './lib';
import {
  setTalkMsg,
  setSpinUrl,
  setSpinTime,
  setPermissions,
  setViewers,
  resetChats,
  setChatsWithChatlog,
  setChatsWithChat,
  selectPermissions,
  setDescription,
  deleteChatMessage,
  setPromoted,
  setBanned
} from './features/station/stationSlice';
import {
  setUserInteracted,
  setTunePatP,
  setPlayerReady,
  setNavigationOpen,
  setPlayerInSync,
  setIsConnecting,
} from './features/ui/uiSlice';

import {isValidPatp} from 'urbit-ob';
import ReactPlayer from 'react-player';
import store from './app/store';

export function timestampFromTime(time: number) {
  const date = new Date(time * 1000);
  const currentYear = new Date().getFullYear();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();

  const isToday = new Date().toDateString() === date.toDateString();
  const isDifferentYear = year !== currentYear;

  if (isDifferentYear) {
    return `${month}/${day}/${year}`;
  } else if (!isToday) {
    return `${month}/${day}`;
  } else {
    return `${hours}:${minutes}`;
  }
}

export function getRecencyText(diff:number) {
  if (diff < 60000) {
    return "now";
  }
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins} ${mins === 1 ? 'min' : 'mins'} ago`;
  }
  if (diff < 86400000) {
    const hrs = Math.floor(diff / 3600000);
    return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ago`;
  }
  if (diff > 7307200000) {
    const years = Math.floor(diff / 31536000000);
    const months = Math.floor((diff % 31536000000) / 2592000000);
    return `${years} ${years === 1 ? 'yr' : 'yrs'} ${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const days = Math.floor(diff / 86400000);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (date < oneWeekAgo) {
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(',', '');
  } else {
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const day = isToday ? 'Today' : isYesterday ? 'Yesterday' : date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${day} ${time}`;
  }
}

export const maxTowerAgeInMinutes = 10;

export function isOlderThanNMinutes(unixTimestamp: number | undefined, nMinutes : number): boolean {
  if (!unixTimestamp) return false;

  const NMinutesInMilliseconds = nMinutes * 60 * 1000; 
  const currentTime = new Date().getTime();
  const difference = currentTime - (unixTimestamp * 1000); // convert Unix timestamp to milliseconds

  return difference >= NMinutesInMilliseconds;
}

export function handleUpdate(update: any, radio: Radio, dispatch: any, userInteracted: boolean) {
  if(Object.keys(update).length === 0) {
    return;
  }
  dispatch(setIsConnecting(false))
  console.log("radio update", update);

  let head = Object.keys(update)[0];
  // handle updates from tower, remote radio station
  switch (head) {
    case 'tower-update':
      let tower = update['tower-update']
      dispatch(setSpinUrl(tower.spin.url));
      dispatch(setSpinTime(tower.spin.time));
      dispatch(setViewers(tower.viewers));
      dispatch(setPermissions(tower.permissions))
      dispatch(setChatsWithChatlog(tower.chatlog));
      dispatch(setDescription(tower.description));
      dispatch(setPromoted(tower.promoted));
      dispatch(setBanned(tower.banned));
      break;
    case 'spin':
      var updateSpin = update['spin'];

      dispatch(setSpinUrl(updateSpin.url));
      dispatch(setSpinTime(updateSpin.time));
      break;
    case 'talk':
      // let synth = window.speechSynthesis;
      var updateTalk = update['talk'];
      var utterThis = new SpeechSynthesisUtterance(updateTalk);

      dispatch(setTalkMsg(updateTalk));

      if (!userInteracted) return;
      radio.synth.speak(utterThis);
      break;
    case 'tune':
      let tune = update['tune'];
      if (tune === null) {
        // we dont really handle null, so just nav to your station.
        // this can happen if multiple frontends are open for one ship, and one closes.
        // or if you are kicked from the station for whatever reason.
        tune = radio.our
      }
      dispatch(setTunePatP(tune));
      
      // Get the current URL and parse its search parameters
      const url = new URL(window.location.href);
      const searchParams = new URLSearchParams(url.search);

      // Set a new value for the "param" parameter
      searchParams.set("station", tune);

      // Replace the search parameters in the URL with the updated ones
      url.search = searchParams.toString();

      // Update the browser's address bar with the new URL
      window.history.replaceState(null, "", url.href);

      radio.ping();
      break;
    case 'chat':
      let chat = update['chat'];
      dispatch(setChatsWithChat(chat));
      // lol
      // this was fun, but turning it off because it breaks some actual usecases
      // no more farting on stream
      //  if(chat.message==='BRAP') {
      //    let audio = new Audio(radio.soundUrls.fart)
      //    audio.play()
      //  }
      break;
    case 'viewers':
      let viewers = update['viewers'];
      /*
      if(radio.tunedTo === radio.our) {
        // TODO finish this and make it toggleable
        // play a sound for new viewers
        // (if we're the host)
        let audio = new Audio(radio.soundUrls.orb)
        audio.play()
      }
      */
      dispatch(setViewers(viewers));
      break;
    case 'chatlog':
      let chatlog = update['chatlog']
      dispatch(setChatsWithChatlog(chatlog));
      break;
    case 'permissions':
      let perm = update['permissions']
      dispatch(setPermissions(perm))
      break;
    case 'description':
      dispatch(setDescription(update['description']))
      break;
    case 'delete-chat':
      let deleteChat = update['delete-chat'];
      dispatch(deleteChatMessage(deleteChat));
      break;
  }
};
