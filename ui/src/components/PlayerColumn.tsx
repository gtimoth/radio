import React, { FC, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { isMobile } from "react-device-detect";
import { Radio } from "../lib";
import { Navigation } from "./Navigation";
import { HelpMenu } from "./HelpMenu";
import { IsConnectingOverlay } from './IsConnectingOverlay';
import { useAppSelector, useAppDispatch } from "../app/hooks";
import {
  selectSpinUrl,
  selectSpinTime,
  selectViewers,
} from "../features/station/stationSlice";
import {
  setPlayerReady,
  setPlayerInSync,
  selectPlayerInSync,
  selectPlayerReady,
  selectIsConnecting,
  selectTunePatP,
  // setPlayerRef
} from "../features/ui/uiSlice";


export const playerColumnId = "radio-player-wrapper";

export const PlayerColumn: FC = () => {
  const radio = window.radio;

  const spinUrl = useAppSelector(selectSpinUrl);
  const spinTime = useAppSelector(selectSpinTime);
  const tunePatP = useAppSelector(selectTunePatP);
  const playerReady = useAppSelector(selectPlayerReady);
  const playerInSync = useAppSelector(selectPlayerInSync);
  const viewers = useAppSelector(selectViewers);
  const isConnecting = useAppSelector(selectIsConnecting);

  const dispatch = useAppDispatch();

  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [helpMenuTop, setHelpMenuTop] = useState(0);
  const [helpMenuLeft, setHelpMenuLeft] = useState(0);

  const playerRef = useRef<ReactPlayer | null>(null);

  useEffect(() => {
    //@ts-ignore
    window.playerRef = playerRef;
  }, [playerRef]);

  useEffect(() => {
    radio.seekToGlobal(playerRef.current, spinTime);
    dispatch(setPlayerInSync(true));
  }, [spinTime, playerReady])

  function handleProgress(progress: any) {
    // turn on scrub buttons if out of sync

    var currentUnixTime = Date.now() / 1000;
    if (!playerRef.current) return;
    var duration = playerRef.current.getDuration();
    if (!duration) return;

    let localProgress = progress.playedSeconds;
    let globalProgress = Math.ceil(currentUnixTime - spinTime);

    globalProgress = globalProgress % duration;

    let outOfSync = Math.abs(localProgress - globalProgress);

    if (outOfSync > 2) {
      dispatch(setPlayerInSync(false));
      return;
    }
  }

  const buttonRow = (
    <div style={{ display: "flex", marginLeft: "auto" }}>
      {!playerInSync && (
        <div>
          <button
            className={`hover:pointer px-4 py-2 \
                      flex-initial outline-none \
                      font-bold underline border-black border-t-0 \
                        text-gray-500 `}
            onClick={(e) => {
              radio.seekToGlobal(playerRef.current, spinTime);
              dispatch(setPlayerInSync(true));
            }}
            style={{
              userSelect:"none"
            }}
          >
            resync
          </button>
          {tunePatP === radio.our && (
            <button
              className={`hover:pointer px-4 py-2 \
                        flex-initial outline-none \
                        font-bold underline border-black border-t-0 \
                        text-gray-500 `}
              onClick={(e) => {
                radio.resyncAll(playerRef.current, tunePatP, spinUrl);
              }}
              style={{
                whiteSpace: "nowrap",
                userSelect:"none"
              }}
            >
              resync all
            </button>
          )}
        </div>
      )}
      <div>
        <button
          className={`hover:pointer px-4 py-2 \
                  flex-initial outline-none \
                  font-bold underline border border-t-0 \
                  ${helpMenuOpen ? "border-black" : "border-white"}`}
          onClick={(e) => {
            setHelpMenuLeft(e.clientX - (isMobile ? 30 : 0));
            setHelpMenuTop(isMobile ? window.innerHeight : e.clientY);
            setHelpMenuOpen(!helpMenuOpen);
          }}
          style={{
            userSelect:"none"
          }}
        >
          help
        </button>
      </div>
      {helpMenuOpen && <HelpMenu left={helpMenuLeft} top={helpMenuTop} />}
    </div>
  );

  const viewersCountText = () => {
      if (viewers.length === 1) {
        return `${viewers.length} viewer`
      }
      return `${viewers.length} viewers`
    }

  // const mockViewers = Array.from({ length: 200 }, (_, i) => `Viewer${i + 1}`);

  return (
    <div
      className={isMobile ? "" : "inline-block flex flex-col h-full"}
      style={{
        flex: isMobile ? "1" : "2",
      }}
      id={playerColumnId}
    >
      <div
        className="flex flex-1"
        style={{
          height: isMobile ? "30vh" : "80vh",
          backgroundColor: "black",
        }}
      >
        {isConnecting && <IsConnectingOverlay />}
        <ReactPlayer
          ref={playerRef}
          url={spinUrl}
          playing={true}
          controls={true}
          width="100%"
          height="100%"
          loop={true}
          onReady={() => dispatch(setPlayerReady(true))}
          onProgress={(e) => handleProgress(e)}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
          config={{
            file: {
              attributes: {
                style: {
                  height: "default",
                  maxHeight: "100%",
                  width: "100%",
                },
              },
            },
          }}
        />
      </div>
      <div className="text-[0.6rem]">
        <div className="flex items-center justify-between">
          <div className="flex-initial">
            {viewersCountText()}
          </div>
          <div className="flex-grow" />
          <div className="flex">
            {buttonRow}
          </div>
        </div>

        <div
          className="text-[0.6rem]"
          style={{
            maxHeight: isMobile ? "2rem" : "6rem",
            overflowY: "auto",
          }}
        >
          {viewers.map((x, i) => (
            <React.Fragment key={i}>
              <span className="inline-block">
                {x}
                {i < viewers.length - 1 && (
                  <>
                    {','}&nbsp;
                  </>
                )}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
