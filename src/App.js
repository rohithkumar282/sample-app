import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const socketUrl = process.env.REACT_APP_WEBSOCKET_URL;

    if (!socketUrl) {
      console.error("WebSocket URL not set (check REACT_APP_WEBSOCKET_URL env var)");
      return;
    }

    const socket = new WebSocket(socketUrl);

    socket.onopen = () => {
      console.log("Connected to WebSocket:", socketUrl);
    };

    socket.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
    };

    socket.onclose = () => {
      console.log("Disconnected from WebSocket");
    };

    return () => socket.close();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold underline">Hello</h1>
      <div className="mt-4 p-4 border rounded bg-gray-100 min-h-[200px]">
        {messages.length === 0 ? (
          <p className="text-gray-500">No messages yet...</p>
        ) : (
          messages.map((msg, i) => (
            <pre key={i} className="border-b py-2 whitespace-pre-wrap">
              {msg}
            </pre>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
