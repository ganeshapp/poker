import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Note: StrictMode is intentionally omitted. The game loop is driven by timers
// and effects; StrictMode's dev double-invocation would double-fire deals.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
