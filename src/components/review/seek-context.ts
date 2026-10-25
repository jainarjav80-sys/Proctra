"use client";

import { createContext, useContext } from "react";

/** Latest seek request (wall ms on the review timeline); `n` changes on every request, even to the same time. */
export interface SeekRequest {
  wallMs: number;
  n: number;
}

export const SeekContext = createContext<SeekRequest | null>(null);
export const useSeekRequest = () => useContext(SeekContext);
