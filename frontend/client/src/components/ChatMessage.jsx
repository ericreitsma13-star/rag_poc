import React, { useState } from "react";

// ── Minimal markdown renderer ─────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Heading
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizes = { 1: "17px", 2: "15px", 3: "14px" };
      const weights = { 1: 700, 2: 650, 3: 600 };
      elements.push(
        <div key={key++} style={{
          fontSize: sizes[level], fontWeight: weights[level],
          marginTop: level === 1 ? "14px" : "10px", marginBottom: "4px",
          color: "var(--text)", lineHeight: 1.3,
        }}>
          {inlineFormat(hMatch[2])}
        </div>
      );
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={key++} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "10px 0" }} />);
      i++; continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={key++} style={{ paddingLeft: "18px", margin: "4px 0", display: "flex", flexDirection: "column", gap: "2px" }}>
          {items.map((item, j) => (
            <li key={j} style={{ lineHeight: 1.6 }}>{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} style={{ paddingLeft: "20px", margin: "4px 0", display: "flex", flexDirection: "column", gap: "2px" }}>
          {items.map((item, j) => (
            <li key={j} style={{ lineHeight: 1.6 }}>{inlineFormat(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={key++} style={{ margin: "3px 0", lineHeight: 1.7 }}>
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

// Inline bold, italic, code — no citation chips here (handled separately)
function inlineFormat(text) {
  const parts = [];
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    if (match[0].startsWith("**")) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[0].startsWith("*")) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[0].startsWith("`")) {
      parts.push(
        <code key={match.index} style={{
          fontFamily: "var(--mono)", fontSize: "12px",
          background: "var(--surface-2)", padding: "1px 5px",
          borderRadius: "3px", border: "1px solid var(--border)",
        }}>
          {match[4]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 1 ? parts : text;
}

// ── Styles ────────────────────────────────────────────────────────────────
const S = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    animation: "fadeIn 200ms ease both",
  },
  userWrap: { alignItems: "flex-end" },
  assistantWrap: { alignItems: "flex-start" },

  bubble: {
    maxWidth: "78%",
    padding: "12px 16px",
    borderRadius: "var(--radius-lg)",
    fontSize: "14px",
    wordBreak: "break-word",
  },
  userBubble: {
    background: "var(--accent)",
    color: "#fff",
    borderBottomRightRadius: "3px",
    lineHeight: 1.65,
  },
  assistantBubble: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderBottomLeftRadius: "3px",
    boxShadow: "var(--shadow)",
  },
  errorBubble: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderBottomLeftRadius: "3px",
  },

  citations: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px solid var(--border)",
  },
  citationsLabel: {
    width: "100%",
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    color: "var(--text-3)",
    marginBottom: "2px",
  },
  citationChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    background: "var(--accent-light)",
    border: "1px solid #bfdbfe",
    borderRadius: "99px",
    fontSize: "11px",
    fontFamily: "var(--mono)",
    color: "var(--accent-2)",
    cursor: "default",
    whiteSpace: "nowrap",
  },
  tooltip: {
    position: "absolute",
    bottom: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--text)",
    color: "#fff",
    fontSize: "11px",
    padding: "4px 8px",
    borderRadius: "var(--radius)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 10,
  },
  meta: {
    fontSize: "11px",
    color: "var(--text-3)",
    paddingLeft: "4px",
  },
};

function CitationChip({ citation }) {
  const [hover, setHover] = useState(false);
  const label = (citation.label || `${citation.file}#${citation.chunk}`).trim();
  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={S.citationChip}>[{label}]</span>
      {hover && citation.file && (
        <div style={S.tooltip}>{citation.file} · chunk {citation.chunk}</div>
      )}
    </span>
  );
}

function dedupCitations(citations) {
  const seen = new Set();
  return (citations || [])
    .map((c) => ({ ...c, label: (c.label || `${c.file}#${c.chunk}`).trim() }))
    .filter((c) => {
      if (seen.has(c.label)) return false;
      seen.add(c.label);
      return true;
    });
}

// Strip trailing "Bronnen:" / "Sources:" block the LLM appends
// Also fix [ \n label \n ] whitespace the LLM adds around citations
function cleanAnswer(text) {
  return text
    .replace(/\[\s*\n\s*/g, "[")
    .replace(/\s*\n\s*\]/g, "]")
    .replace(/\n*(bronnen|sources|citations)\s*:[\s\S]*$/i, "")
    .trim();
}

export default function ChatMessage({ message }) {
  const { role, text, citations } = message;

  const displayText = role === "assistant" ? cleanAnswer(text) : text;
  const cleanCitations = dedupCitations(citations);

  const wrapStyle = { ...S.wrap, ...(role === "user" ? S.userWrap : S.assistantWrap) };
  const bubbleStyle = {
    ...S.bubble,
    ...(role === "user"  ? S.userBubble  :
        role === "error" ? S.errorBubble :
                           S.assistantBubble),
  };

  return (
    <div style={wrapStyle}>
      <div style={bubbleStyle}>
        {role === "assistant" ? (
          <div>{renderMarkdown(displayText)}</div>
        ) : (
          <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{displayText}</span>
        )}

        {role === "assistant" && cleanCitations.length > 0 && (
          <div style={S.citations}>
            <div style={S.citationsLabel}>Sources</div>
            {cleanCitations.map((c, i) => (
              <CitationChip key={i} citation={c} />
            ))}
          </div>
        )}
      </div>
      <span style={S.meta}>
        {role === "user" ? "you" : role === "error" ? "error" : "rag"}
      </span>
    </div>
  );
}
