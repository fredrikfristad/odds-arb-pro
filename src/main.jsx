import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

const ErrorScreen = ({ error }) => (
  <div style={{
    minHeight: "100vh",
    background: "#050810",
    color: "#f2f2f7",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    padding: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }}>
    <div style={{
      maxWidth: 560,
      width: "100%",
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.05)",
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        Appen krasjet under lasting
      </div>
      <div style={{ color: "#8e8e93", lineHeight: 1.5, marginBottom: 14 }}>
        Dette er bedre enn hvit skjerm: kopier feilmeldingen under og send den videre, så kan feilen rettes raskt.
      </div>
      <pre style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "#0d1117",
        border: "1px solid #1a2540",
        borderRadius: 8,
        padding: 12,
        color: "#ff453a",
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        {error?.stack || error?.message || String(error)}
      </pre>
    </div>
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) return <ErrorScreen error={this.state.error} />;
    return this.props.children;
  }
}

try {
  const { default: App } = await import("./App.jsx");
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  root.render(<ErrorScreen error={error} />);
}
