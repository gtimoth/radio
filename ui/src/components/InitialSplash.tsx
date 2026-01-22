import React, { FC, useEffect } from 'react';
import { useAppDispatch } from '../app/hooks';
import { setUserInteracted } from '../features/ui/uiSlice';


export const InitialSplash: FC = () => {

  const dispatch = useAppDispatch();


  function onInteraction() {
    dispatch(setUserInteracted(true))
  }
  useEffect(() => {
    document.addEventListener("keydown", onInteraction);
    document.addEventListener("click", onInteraction);
    return () => {
      document.removeEventListener("keydown", onInteraction);
      document.removeEventListener("click", onInteraction);
    }
  }, []);

  return (
    <main className="flex justify-center overflow-scroll items-center">
      <div className="bg-white mt-2 rounded p-2 lg:w-1/2 mx-6 content-center">
        <h1 className="text-lg font-bold m-2">radio</h1>
        <p className="m-2">first, interact with the webpage so we can autoplay videos</p>
        <p className="m-2">
          press any key to continue, or
          <button
            className="button border-black border p-1 text-center m-2"
            onClick={() => onInteraction()}
          >
            click here
          </button>
        </p>
      </div>
    </main>
  );
};
