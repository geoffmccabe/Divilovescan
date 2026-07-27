import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { ChainProvider } from "./chainMode";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <ChainProvider>
          <App />
        </ChainProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
