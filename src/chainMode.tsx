import { createContext, useContext, useState, type ReactNode } from "react";

// Which chain the explorer is viewing. DIVI is the UTXO L1; DIVA is the EVM
// side-chain. Persisted so the choice survives a refresh.
export type Chain = "divi" | "diva";
const KEY = "dls.chain";

interface Ctx {
  chain: Chain;
  setChain: (c: Chain) => void;
}
const ChainCtx = createContext<Ctx>({ chain: "divi", setChain: () => {} });

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChainState] = useState<Chain>(() => {
    try {
      return (localStorage.getItem(KEY) as Chain) === "diva" ? "diva" : "divi";
    } catch {
      return "divi";
    }
  });
  const setChain = (c: Chain) => {
    setChainState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* storage unavailable */
    }
  };
  return <ChainCtx.Provider value={{ chain, setChain }}>{children}</ChainCtx.Provider>;
}

export const useChain = () => useContext(ChainCtx);
