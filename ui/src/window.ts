import type { RefObject } from "react";
import type ReactPlayer from "react-player";
import { Radio } from "./lib";

declare global {
  interface Window {
    radio: Radio;
    playerRef?: RefObject<ReactPlayer>;
  }
}

export {};
