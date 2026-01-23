import React, { FC, useCallback, useEffect, useState } from "react";
import { useAppSelector, useAppDispatch } from "../app/hooks";
import { NavItem } from "./NavItem";
import {
  selectDescription,
  selectPermissions,
} from "../features/station/stationSlice";
import {
  setNavigationOpen,
  selectNavigationOpen,
  selectTunePatP,
} from "../features/ui/uiSlice";
import {
  isOlderThanNMinutes,
  maxTowerAgeInMinutes,
} from "../util";
import { StationSummary } from "../lib";


function splitMinitowersByAge(minitowers: StationSummary[]): {
  newTowers: StationSummary[];
  oldTowers: StationSummary[];
} {
  // Split the Minitowers into two arrays
  const newTowers = minitowers.filter(
    (minitower) => !isOlderThanNMinutes(minitower.time, maxTowerAgeInMinutes)
  );
  const oldTowers = minitowers.filter((minitower) =>
    isOlderThanNMinutes(minitower.time, maxTowerAgeInMinutes)
  );

  return { newTowers, oldTowers };
}

export const Navigation: FC = () => {
  const radio = window.radio;

  const tunePatP = useAppSelector(selectTunePatP);
  const permissions = useAppSelector(selectPermissions);
  const description = useAppSelector(selectDescription);
  const navigationOpen = useAppSelector(selectNavigationOpen);
  const dispatch = useAppDispatch();

  const [towers, setTowers] = useState<Array<StationSummary>>([]);

  const refreshTowers = useCallback(async () => {
    try {
      const listings = await radio.fetchStations();
      const { newTowers, oldTowers } = splitMinitowersByAge(listings);
      newTowers.sort((a, b) => b.viewers - a.viewers);
      oldTowers.sort((a, b) => b.time - a.time);
      setTowers([...newTowers, ...oldTowers]);
    } catch (err) {
      console.warn("failed to load stations", err);
    }
  }, [radio]);

  useEffect(() => {
    refreshTowers();
  }, [refreshTowers]);

  useEffect(() => {
    if (!navigationOpen) return;
    const interval = setInterval(() => {
      void refreshTowers();
    }, 30000);
    return () => clearInterval(interval);
  }, [navigationOpen, refreshTowers]);

  const [currentTime, setCurrentTime] = useState(new Date().getTime() / 1000);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date().getTime() / 1000);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <>
      <div className="flex flex-row my-2 w-full h-8">
        <div
          className="flex-initial flex flex-col mr-3"
          style={{
            justifyContent: "center",
          }}
        >
          <button
            className={`hover:pointer button border-black \
                    border p-1 text-center\
                    ${navigationOpen ? "font-bold" : ""}`}
            style={{ whiteSpace: "nowrap", userSelect: "none",}}
            onClick={() => {
              if (!navigationOpen) {
                void refreshTowers();
              }
              dispatch(setNavigationOpen(!navigationOpen));
            }}
          >
            navigation
          </button>

          {navigationOpen && (
            <div>
              <div
                className="flex flex-col bg-white border border-black absolute \
              p-2 overflow-scroll z-10 items-start mt-1"
                style={{
                  maxHeight: "50%",
                  maxWidth: "90%",
                  overflowY: "scroll",
                }}
              >
                {tunePatP !== radio.our && (
                  <NavItem
                    patp={radio.our}
                    radio={radio}
                    title={"my station"}
                  />
                )}

                {tunePatP !== radio.hub && (
                  <NavItem patp={radio.hub} radio={radio} title={"hub"} />
                )}
                {towers.map((tower: any, i: number) => (
                  <NavItem
                    radio={radio}
                    key={i}
                    patp={tower.location}
                    flare={tower.viewers.toString()}
                    description={tower.description}
                    time={tower.time}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* tuned to */}
        <div className="flex-1 w-full inline-block flex flex-row items-center">
          <span className="text-xl mr-3 pb-1 flex-initial cursor-default"
            style={{
              userSelect: "none",
            }}
          >
            📻 {permissions === 'open' ? "🎉" : ""}
          </span>

          <div className="flex-1 flex flex-row h-8">
            <div className="flex-1 flex flex-col">
              <div className="flex h-full items-center">
                <span className="font-semibold text-center">{tunePatP}</span>
              </div>
              {description !== '' &&
                <div className="flex-1 text-gray-600 overflow-x-none"
                  style={{
                    fontSize: '0.65rem'
                  }}
                >
                  {description}
                </div>
              }
            </div>
          </div>

        </div>
        <div className="flex flex-col items-center justify-center text-[0.6rem]">
          <span className="text-center text-gray-900">{new Date(currentTime*1000).toLocaleTimeString()}</span>
        </div>

      </div>
    </>
  );
};
