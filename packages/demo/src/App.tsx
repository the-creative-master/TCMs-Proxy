import { css, type Component } from "dreamland/core";
import BrowserView from "./pages/BrowserView";

const App: Component = function () {
  return <BrowserView />;
};

App.style = css`
  @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");

  :scope {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #080910;
    color: #e9ebf5;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
    -webkit-font-smoothing: antialiased;
  }
`;

export default App;
