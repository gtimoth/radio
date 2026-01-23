import React, { FC } from "react";
import { useAppDispatch } from "../app/hooks";
import { Radio } from "../lib";
import { isOlderThanNMinutes, maxTowerAgeInMinutes, timestampFromTime } from "../util";

interface INavItem {
  patp: string;
  flare?: string;
  title?: string;
  // logout?: boolean,
  radio: Radio;
  description?: string;
  time?: number;
}

export const NavItem: FC<INavItem> = (props: INavItem) => {
  const dispatch = useAppDispatch();

  const { patp, radio, flare, title, description, time } = props;
  const LiveNavItem = () => {
    return (
      <button
        className="hover:pointer border-black  \
                   border px-1 text-left inline-block \
                   flex-initial mr-2 my-1"
        style={{ whiteSpace: "nowrap" }}
        onClick={() => radio.tuneAndReset(dispatch, patp)}
      >
        <div>
          {flare && `${flare} `}
          {title ? title : patp}
        </div>
        {description && (
          <div
            className="text-gray-500"
            style={{ fontSize: "0.65rem" }}
          >
            {description}
          </div>
        )}
      </button>
    );
  };
  const PastNavItem = () => {
    return (
      <button
        className="hover:pointer \
                   border px-1 text-left inline-block \
                   flex-initial mr-2 my-1"
        style={{
          whiteSpace: "nowrap",
          borderColor: "#888",
          color: "#888",
        }}
        onClick={() => radio.tuneAndReset(dispatch, patp)}
      >
        <div>
          <span className={"mr-2 text-gray-500"}>
            {timestampFromTime(time!)}
          </span>
          {title ? title : patp}
        </div>
        {description && (
          <div
            className="text-gray-500"
            style={{ fontSize: "0.65rem" }}
          >
            {description}
          </div>
        )}
      </button>
    );
  };

  if (isOlderThanNMinutes(time, maxTowerAgeInMinutes)) {
    return PastNavItem();
  }
  return LiveNavItem();
};
