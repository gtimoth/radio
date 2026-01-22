import { useRef, useEffect, useState, useCallback } from "react";
import { ChatMessage, chopChats, selectChats, selectBanned, selectPromoted } from "../features/station/stationSlice";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import React from "react";
import { getRecencyText } from "../util";
import { FaBars } from 'react-icons/fa';
import { chatInputId } from "./ChatColumn";
import DOMPurify from 'dompurify';
import { selectTunePatP } from "../features/ui/uiSlice";

export const chatboxId = "radio-chatbox";

type ChatInnerMessageProps = {
  message: string;
  maybeAutoScrollChatBox: () => void;
};

const ChatInnerMessage: React.FC<ChatInnerMessageProps> = ({ message, maybeAutoScrollChatBox }) => {
  const linkRegex = /^https?:\/\/\S+$/i;
  const imageRegex = /^https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)$/i;
  // const emojiRegex = /^\p{Emoji}+$/u;
  const playRegex = /^!play /;

  if (linkRegex.test(message)) {
    let sanitizedUrl = sanitize(message);
    if (imageRegex.test(sanitizedUrl)) {
      return chatInnerImg(sanitizedUrl, maybeAutoScrollChatBox);
    } else {
      return (
        safeLinkTag(sanitizedUrl)
      );
    }
    // this is torture
    // } else if (emojiRegex.test(message)) {
    //   return <span style={{ fontSize: '2em' }}>{message.substring(0, 24)}</span>;
  } else if (playRegex.test(message)) {
    // special case for !play links because thats useful
    let url = message.substring(6);
    return (
      <>
        {"!play "}
        {safeLinkTag(url)}
      </>
    )
  } else {
    return (
    <>{message}</>
    )
  }
};

function sanitize(rawURL: string) {
  const sanitizedUrl = DOMPurify.sanitize(rawURL, {
    ALLOWED_TAGS: [], // disallow any HTML tags
    ALLOWED_ATTR: [], // disallow any HTML attributes
    ALLOW_DATA_ATTR: false, // disallow data: URLs
    ALLOWED_URI_REGEXP: /^https?:\/\//i, // allow only HTTP(S) URLs
  });
  return sanitizedUrl;
}
function safeLinkTag(rawURL: string) {
  let sanitizedUrl = sanitize(rawURL);
  return (
    <a href={sanitizedUrl} target="_blank"
      rel="noopener noreferrer"
      className="text-blue-800 hover:underline">
      {sanitizedUrl}
    </a>
  )
}

function autoScrollChatBox() {
  const chatbox = document.getElementById(chatboxId);
  if (chatbox?.lastChild instanceof Element) {
    // chatbox.lastChild.scrollIntoView({ behavior: "smooth" });
    chatbox.lastChild.scrollIntoView();
  }
}

const chatInnerImg = (src: string, maybeAutoScrollChatBox: () => void) => {
  return (
    <img
      key={src}
      src={src}
      className={"ml-2"}
      style={{
        height: "100%",
        maxHeight: "12vh",
        objectFit: "cover",
      }}
      onLoad={maybeAutoScrollChatBox}
    />
  );
};

export function ChatBox({ }: {}) {
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const chatboxRef = useRef<HTMLDivElement>(null);
  const chats = useAppSelector(selectChats);
  const tunePatP = useAppSelector(selectTunePatP);

  const dispatch = useAppDispatch();

  const [unseenNewMessagesCount, setUnseenNewMessagesCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [chatUpdatesSinceLastTune, setChatUpdatesSinceLastTune] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setChatUpdatesSinceLastTune(0);
  }, [tunePatP]);

  useEffect(() => {
    setChatUpdatesSinceLastTune(prev => prev + 1);
    
    if (chatUpdatesSinceLastTune < 3) {
      // Create an interval that forces scroll for 1 second
      const intervalId = setInterval(() => {
        autoScrollChatBox();
      }, 300);

      // Clean up interval after 1 second
      setTimeout(() => {
        clearInterval(intervalId);
      }, 1000);

      return () => clearInterval(intervalId);
    } else if (!isScrolledUp) {
      autoScrollChatBox();
    }
  }, [chats]);

  const maxChats = 200;
  useEffect(() => {
    // maximum chats
    if (!isScrolledUp && chats.length > maxChats) {
      dispatch(chopChats(chats));
    }
  }, [chats]);

  const handleScroll = () => {
    if (chatboxRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatboxRef.current;
      const isScrolledToBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setIsScrolledUp(!isScrolledToBottom);
      
      if (isScrolledToBottom) {
        setUnseenNewMessagesCount(0);
        if(chats.length > maxChats) {
          dispatch(chopChats(chats));
        }
      }
    }
  };

  const scrollToBottom = () => {
    if (chatboxRef.current) {
      chatboxRef.current.scrollTop = chatboxRef.current.scrollHeight;
      setIsScrolledUp(false);
      setUnseenNewMessagesCount(0);
    }
  };

  const maybeAutoScrollChatBox = useCallback(() => {
    if (!isScrolledUp) {
      autoScrollChatBox();
    }
  }, [isScrolledUp]);

  const chatToHTML = useCallback((key: number, chat: ChatMessage) => {
    const isAdminOrPromoted = window.radio.isAdminOrPromoted();
    return (
      <div key={key} className="p-1 hover:bg-gray-100 pb-0 text-[0.7rem] group">
        <div className="block">
          <span className={"font-bold mr-1"}>
            {chat.from}
            {":"}
          </span>
          <span className={"mr-2 text-gray-500 text-[0.6rem]"}>
            {getRecencyText(currentTime - (chat.time * 1000))}
          </span>
        </div>
        <ChatInnerMessage 
          message={chat.message}
          maybeAutoScrollChatBox={maybeAutoScrollChatBox}
        />
        <div className="text-[0.6rem] flex justify-end gap-3">
          <div 
            className={`text-red-500 cursor-pointer inline-block ${isAdminOrPromoted ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`}
            onClick={(e) => {
              window.radio.deleteChat(chat.from, chat.time)
            }}
          >
            delete
          </div>
          <div 
            className={`text-red-500 cursor-pointer inline-block ${isAdminOrPromoted ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`}
            onClick={(e) => {
              if (window.confirm(`Are you sure you want to ban ${chat.from}?`)) {
                window.radio.ban(chat.from)
              }
            }}
          >
            ban
          </div>
        </div>
      </div>
    );
  }, [currentTime, maybeAutoScrollChatBox]);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const banned = useAppSelector(selectBanned);
  const promoted = useAppSelector(selectPromoted);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const [banInput, setBanInput] = useState('');
  const [modInput, setModInput] = useState('');

  return (
    <div
      className="flex-1 h-full overflow-y-auto overflow-x-hidden flex font-mono relative"
      style={{
        justifyContent: "flex-end",
      }}
    >
      {window.radio.isAdminOrPromoted() && (
        <div className="absolute top-0 left-0 right-0 p-2 border border-gray-200 bg-white flex justify-between items-center z-10"
        >
          <span>Admin Panel</span>
          <FaBars className="cursor-pointer" onClick={togglePanel} />
        </div>
      )}
      {isPanelOpen && (
        <div className="absolute top-10 left-0 right-0 bottom-0 bg-white z-20 overflow-y-auto border border-gray-200 p-2">
          <div className="mb-4">
            <h3 className="font-bold">Banned Users:</h3>
            <div className="text-[0.6rem] mb-2">
              {banned.map((user, i) => (
                <React.Fragment key={i}>
                  <span className="inline-block">
                    {user}
                    {i < banned.length - 1 && (
                      <>
                        {','}&nbsp;
                      </>
                    )}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center">
              <input
                type="text"
                value={banInput}
                onChange={(e) => setBanInput(e.target.value)}
                className="border border-gray-300 px-2 py-1 text-sm mr-2"
                placeholder="~sampel"
              />
              <button
                onClick={() => {
                  if (banInput && window.confirm(`Are you sure you want to ban ${banInput}?`)) {
                    window.radio.ban(banInput);
                    setBanInput('');
                  }
                }}
                className="border border-gray-300 px-2 py-1 text-sm mr-2  hover:bg-gray-100"
              >
                ban
              </button>
              <button
                onClick={() => {
                  if (banInput && window.confirm(`Are you sure you want to unban ${banInput}?`)) {
                    window.radio.unban(banInput);
                    setBanInput('');
                  }
                }}
                className="border border-gray-300 px-2 py-1 text-sm hover:bg-gray-100"
              >
                unban
              </button>
            </div>
          </div>
          <div>
            <h3 className="font-bold">Promoted Users:</h3>
            <div className="text-[0.6rem] mb-2">
              {promoted.map((user, i) => (
                <React.Fragment key={i}>
                  <span className="inline-block">
                    {user}
                    {i < promoted.length - 1 && (
                      <>
                        {','}&nbsp;
                      </>
                    )}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center">
              <input
                type="text"
                value={modInput}
                onChange={(e) => setModInput(e.target.value)}
                className="border border-gray-300 px-2 py-1 text-sm mr-2"
                placeholder="~sampel"
              />
              <button
                onClick={() => {
                  if (modInput && window.confirm(`Are you sure you want to promote ${modInput} to moderator?`)) {
                    window.radio.mod(modInput);
                    setModInput('');
                  }
                }}
                className="border border-gray-300 px-2 py-1 text-sm mr-2 hover:bg-gray-100"
              >
                mod
              </button>
              <button
                onClick={() => {
                  if (modInput && window.confirm(`Are you sure you want to demote ${modInput} from moderator?`)) {
                    window.radio.unmod(modInput);
                    setModInput('');
                  }
                }}
                className="border border-gray-300 px-2 py-1 text-sm hover:bg-gray-100"
              >
                unmod
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className="flex-1 flex flex-col h-full"
        style={{
          verticalAlign: "bottom",
          justifyContent: "flex-end",
          wordBreak: 'break-word',
          overflowWrap: "break-word",
        }}
      >
        <div 
          id={chatboxId} 
          className="overflow-y-auto overflow-x-hidden"
          style={{
            paddingTop: window.radio.isAdminOrPromoted() ? "40px" : "0",
          }}
          ref={chatboxRef}
          onScroll={handleScroll}
        >
          {chats.map((chat, i) => chatToHTML(i, chat))}
        </div>
      </div>
      {(isScrolledUp) &&(
        <button
          className="absolute bottom-0 right-0 border border-gray-400 text-gray-700 bg-white px-3 py-1 shadow-md hover:bg-gray-100 transition-colors duration-200"
          onClick={scrollToBottom}
          style={{
            userSelect:"none",
          }}
        >
          {unseenNewMessagesCount > 0 ? `${unseenNewMessagesCount} new ${unseenNewMessagesCount === 1 ? 'message' : 'messages'}`
            : 'latest'}
        </button>
      )}
    </div>
  );
}
