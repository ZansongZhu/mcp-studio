import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

console.log("main.tsx loading...");

const rootElement = document.getElementById("root");
console.log("Root element:", rootElement);

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  console.log("React root created");
  
  root.render(<App />);
  
  console.log("App rendered");
} else {
  console.error("Root element not found!");
  // Fallback - add content directly to body
  document.body.innerHTML = '<h1 style="color: black; padding: 20px;">ROOT ELEMENT NOT FOUND</h1>';
}
