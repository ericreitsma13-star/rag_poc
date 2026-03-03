import { useState, useCallback } from "react";

export function useChatHistory() {
  const [messages, setMessages] = useState([]);

  const addUser = useCallback((text) => {
    const msg = { id: Date.now(), role: "user", text };
    setMessages((prev) => [...prev, msg]);
    return msg.id;
  }, []);

  const addAssistant = useCallback((answer, citations = []) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 1, role: "assistant", text: answer, citations },
    ]);
  }, []);

  const addError = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 2, role: "error", text },
    ]);
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, addUser, addAssistant, addError, clear };
}
