import React, { useState, useRef, useEffect, useCallback } from "react";
import { useChatHistory } from "../hooks/useChatHistory.js";
import ChatMessage from "./ChatMessage.jsx";
import FilterBar from "./FilterBar.jsx";

const S = {
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg)",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "var(--text-3)",
    userSelect: "none",
  },
  emptyIcon:  { fontSize: "28px", opacity: 0.4 },
  emptyTitle: { fontSize: "14px", fontWeight: 500, color: "var(--text-2)" },
  emptyHint:  { fontSize: "12px" },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    justifyContent: "center",
    marginTop: "12px",
    padding: "0 16px",
  },
  suggestion: {
    padding: "5px 12px",
    border: "1px solid var(--border)",
    borderRadius: "99px",
    background: "var(--surface)",
    color: "var(--text-2)",
    fontSize: "12px",
    cursor: "pointer",
    transition: "border-color var(--transition), color var(--transition)",
  },
  inputArea: {
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
    padding: "12px 16px",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    resize: "none",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: "8px 12px",
    fontSize: "14px",
    lineHeight: 1.5,
    color: "var(--text)",
    background: "var(--surface-2)",
    minHeight: "40px",
    maxHeight: "120px",
    overflowY: "auto",
    fontFamily: "var(--sans)",
  },
  sendBtn: {
    height: "40px",
    width: "40px",
    flexShrink: 0,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: "var(--radius-lg)",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtn: {
    height: "40px",
    width: "40px",
    flexShrink: 0,
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    color: "var(--text-3)",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // Typing cursor blink
  cursor: {
    display: "inline-block",
    width: "2px",
    height: "1em",
    background: "var(--accent)",
    marginLeft: "2px",
    verticalAlign: "text-bottom",
    animation: "pulse 0.8s ease-in-out infinite",
  },
  thinking: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    borderBottomLeftRadius: "3px",
    width: "fit-content",
    boxShadow: "var(--shadow)",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "var(--text-3)",
    animation: "pulse 1.2s ease-in-out infinite",
  },
};

const SUGGESTIONS = [
  "Wat staat er in mijn CV?",
  "Summarise the Q3 report",
  "Wat is de gemiddelde factuurwaarde?",
  "List all suppliers mentioned",
];

// Blinking cursor shown during streaming
function Cursor() {
  return <span style={S.cursor} />;
}

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={S.thinking}>
        {[0, 200, 400].map((delay) => (
          <div key={delay} style={{ ...S.dot, animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}

// Streaming message bubble — renders text as it arrives
function StreamingBubble({ text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
      <div style={{
        ...S.bubble,
        maxWidth: "78%",
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        borderBottomLeftRadius: "3px",
        boxShadow: "var(--shadow)",
        fontSize: "14px",
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {text}
        <Cursor />
      </div>
      <span style={S.meta ?? { fontSize: "11px", color: "var(--text-3)", paddingLeft: "4px" }}>rag</span>
    </div>
  );
}

export default function ChatPanel({ filters, onFiltersChange }) {
  const { messages, addUser, addAssistant, addError, clear } = useChatHistory();
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [streamText, setStreamText] = useState(""); // text being streamed right now
  const bottomRef                   = useRef();
  const textareaRef                 = useRef();
  const abortRef                    = useRef(null); // AbortController for current stream

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamText]);

  const submit = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    addUser(q);
    setLoading(true);
    setStreamText("");

    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v)
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/query/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, ...activeFilters }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";
      let citations = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === "token") {
              accumulated += event.content;
              setStreamText(accumulated);
            } else if (event.type === "citations") {
              citations = event.data || [];
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
            // "done" event — just signals end, we handle below
          } catch (parseErr) {
            if (parseErr.message !== raw) throw parseErr; // re-throw real errors
          }
        }
      }

      // Commit the streamed message to history
      setStreamText("");
      addAssistant(accumulated, citations);

    } catch (err) {
      if (err.name === "AbortError") return; // user cancelled
      setStreamText("");
      addError(err.message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, filters, addUser, addAssistant, addError]);

  const cancel = () => {
    abortRef.current?.abort();
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const isStreaming = loading && streamText.length > 0;
  const isThinking  = loading && streamText.length === 0;

  return (
    <div style={S.panel}>
      <FilterBar filters={filters} onChange={onFiltersChange} />

      <div style={S.messages}>
        {messages.length === 0 && !loading ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>⌕</div>
            <div style={S.emptyTitle}>Ask anything about your documents</div>
            <div style={S.emptyHint}>Dutch or English · citations included</div>
            <div style={S.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  style={S.suggestion}
                  onClick={() => submit(s)}
                  onMouseEnter={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-2)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}

        {isThinking  && <ThinkingBubble />}
        {isStreaming  && <StreamingBubble text={streamText} />}

        <div ref={bottomRef} />
      </div>

      <div style={S.inputArea}>
        <div style={S.inputRow}>
          {(messages.length > 0 || loading) && (
            <button
              style={S.clearBtn}
              onClick={loading ? cancel : clear}
              title={loading ? "Stop generation" : "Clear chat"}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              {loading ? "◼" : "✕"}
            </button>
          )}
          <textarea
            ref={textareaRef}
            style={S.textarea}
            placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e); }}
            onKeyDown={onKey}
            rows={1}
            disabled={loading}
          />
          <button
            style={{ ...S.sendBtn, opacity: (!input.trim() || loading) ? 0.4 : 1 }}
            onClick={() => submit()}
            disabled={!input.trim() || loading}
            title="Send"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
