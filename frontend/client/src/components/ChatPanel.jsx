import React, { useState, useRef, useEffect } from "react";
import { query } from "../lib/api.js";
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
  emptyIcon: { fontSize: "28px", opacity: 0.4 },
  emptyTitle: { fontSize: "14px", fontWeight: 500, color: "var(--text-2)" },
  emptyHint: { fontSize: "12px" },

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
  "Wat staat er in het inkoopbeleid?",
  "Summarise the Q3 report",
  "Wat is de gemiddelde factuurwaarde?",
  "List all suppliers mentioned",
];

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

export default function ChatPanel({ filters, onFiltersChange }) {
  const { messages, addUser, addAssistant, addError, clear } = useChatHistory();
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef();
  const textareaRef             = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    addUser(q);
    setLoading(true);
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v)
      );
      const result = await query({ question: q, ...activeFilters });
      addAssistant(result.answer, result.citations);
    } catch (err) {
      addError(err.message);
    } finally {
      setLoading(false);
    }
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

  return (
    <div style={S.panel}>
      <FilterBar filters={filters} onChange={onFiltersChange} />

      <div style={S.messages}>
        {messages.length === 0 ? (
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
        {loading && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      <div style={S.inputArea}>
        <div style={S.inputRow}>
          {messages.length > 0 && (
            <button
              style={S.clearBtn}
              onClick={clear}
              title="Clear chat"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              ✕
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
