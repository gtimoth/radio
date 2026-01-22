import React, { FC, useEffect, useRef, useCallback } from "react";
import { isMobile } from "react-device-detect";
import { useAppDispatch } from "../app/hooks";
import { ChatBox } from "./ChatBox";
import { Radio } from "../lib";
import Split from "react-split";
import styles from './ChatColumn.module.css';


interface IChatColumn {
  fullscreen?: boolean;
}

export const chatInputId = "radio-chat-input";

export const ChatColumn: FC<IChatColumn> = (props: IChatColumn) => {
  const dispatch = useAppDispatch();

  const inputReference = useRef<HTMLTextAreaElement>(null);

  const radio = window.radio;

  const fullscreen = props.fullscreen;
  let maxWidth = isMobile ? "100%" : "33%";

  const lastClickTimeRef = useRef(0);

  useEffect(() => {
    // autofocus input
    if (!inputReference) return;
    if (!inputReference.current) return;
    window.setTimeout(() => {
      // use a slight delay for better UX
      // @ts-ignore
      if (!inputReference.current) return;
      inputReference.current.focus();
    }, 1000);
  }, []);



  async function processInput() {
    await radio.handleUserInput(dispatch);
  }

  const InputBox = () => {
    const handleQuickMessage = useCallback((message: string) => {
      const currentTime = Date.now();
      if (currentTime - lastClickTimeRef.current >= 1000) {
        if (inputReference.current) {
          inputReference.current.value = message;
          void processInput();
        }
        lastClickTimeRef.current = currentTime;
      }
    }, []);

    const currentDate = new Date();
    const cutoffDate = new Date('2024-08-25');

    return (
      <div className="flex flex-col flex-1 h-full"
        style={{
          overflow:"hidden"
        }}
      >
        <div className="flex flex-grow border-gray-300 border-b"
          style={{
            paddingBottom:"5px",
          }}
        >
          <textarea
            ref={inputReference}
            className={`flex-grow outline-none border-none placeholder-gray-800 ${styles['placeholder-center']}`}
            autoCorrect={"off"}
            autoCapitalize={"off"}
            autoComplete={"off"}
            placeholder="write your message..."
            id={chatInputId}
            onFocus={(e) => e.currentTarget.placeholder = ""}
            onBlur={(e) => e.currentTarget.placeholder = "write your message..."}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void processInput();
              }
            }}
            style={{ width: "100%", boxSizing: "border-box", resize: "none"}}
          />
          <button
            className="px-4 py-2 ml-2 outline-none border-gray-300 border-l"
            onClick={() => {
              void processInput();
            }}
            style={{
              userSelect:"none",
            }}
          >
            send
          </button>
        </div>
        <div className="flex-initial h-10 flex items-center" style={{ whiteSpace: 'nowrap', overflowX: 'auto' }}>
          {['!urbit', '!athens', '!groove', '!cabbit']
            .map((item, index) => (
              <div
                key={index}
                className="inline-block border border-gray-400 text-gray-700 bg-white hover:bg-gray-100 cursor-pointer px-2 py-1 mr-2"
                style={{
                  fontSize:"0.65rem",
                  userSelect:"none",
                }}
                onClick={() => handleQuickMessage(item)}
              >
                 {item}
              </div>
            ))}
        </div>
    </div>
    );
  };

  return (
    <div
      className="text-xs font-mono flex flex-col flex-1 "
      style={{
        // flex: isMobile ? "2" : "1",
        order: "1",
        height: "100%",
        overflow:"auto",
        boxSizing: "border-box",
      }}
    >
      <Split
        sizes={[90, 10]}
        minSize={[100, 75]}
        direction="vertical"
        gutterSize={10}
        style={{
          display: 'flex',
          flex:"1",
          flexDirection: 'column',
          overflow:"auto"
        }}
      >
        <div className="flex-grow overflow-x-hidden">
          <ChatBox />
        </div>
        <div className="flex-initial">
          <InputBox />
        </div>
      </Split>
    </div>
  );
};
