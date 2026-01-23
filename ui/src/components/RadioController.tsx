import React, { FC, useEffect, useRef, useState } from "react";

import { isMobile } from "react-device-detect";
import { useAppSelector, useAppDispatch } from "../app/hooks";

import { InitialSplash } from "./InitialSplash";
import { PlayerColumn } from "./PlayerColumn";
import { ChatColumn } from "./ChatColumn";
import { selectUserInteracted } from "../features/ui/uiSlice";

import Split from 'react-split';
import { Navigation } from "./Navigation";

export const RadioController: FC = () => {
  const userInteracted = useAppSelector(selectUserInteracted);

  const wrapperClass =
    "p-[1vw] lg:p-[10vh] pt-0 lg:pt-0 h-screen text-xs font-mono"

  if (!userInteracted) {
    return (
      <InitialSplash />
    )
  }

  if (isMobile) {
    return (
      <div className="p-1 flex flex-col text-xs font-mono overflow-hidden" style={{ height: '100dvh' }}>
        <div className="flex-none">
          <Navigation />
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-initial overflow-auto">
            <PlayerColumn />
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatColumn />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${wrapperClass} flex flex-col h-screen`}
      style={{ overflow: "hidden" }}
    >
      <div className="flex-none">
        <Navigation />
      </div>
      <div className="flex-1 overflow-hidden">
        <Split
          sizes={[65, 35]}
          minSize={60}
          direction="horizontal"
          gutterSize={10}
          className="split h-full"
          style={{ display: 'flex', height: '100%' }}
        >
          <div className="overflow-hidden h-full">
            <PlayerColumn />
          </div>
          <div className="overflow-hidden h-full">
            <ChatColumn />
          </div>
        </Split>
      </div>
    </div>
  );
};