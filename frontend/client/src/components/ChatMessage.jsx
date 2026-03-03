import React, { useState } from "react";

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
    maxWidth: "72%",
    padding: "10px 14px",
    borderRadius: "var(--radius-lg)",
    lineHeight: 1.65,
    fontSize: "14px",
    wordBreak: "break-word",
  },
  userBubble: {
    background: "var(--accent)",
    color: "#fff",
    borderBottomRightRadius: "3px",
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
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: "1px solid var(--border)",
  },
  citationChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    background: "var(--accent-light)",
    border: "1px solid #bfdbfe",
    borderRadius: "99px",
    fontSize: "11px",
    fontFamily: "var(--mono)",
    color: "var(--accent-2)",
    cursor: "pointer",
    transition: "background var(--transition)",
  },

  citeTooltip: {
    position: "relative",
    display: "inline-block",
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
  const label = citation.label || `${citation.file}#${citation.chunk}`;
  const title = citation.file ? `${citation.file} · chunk ${citation.chunk}` : label;

  return (
    <div
      style={S.citeTooltip}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={S.citationChip}>
        <span style={{ opacity: 0.6 }}>[</span>
        {label}
        <span style={{ opacity: 0.6 }}>]</span>
      </span>
      {hover && <div style={S.tooltip}>{title}</div>}
    </div>
  );
}

// Render inline citation tags like [foo.pdf#3] as styled chips
function AnswerText({ text, citations }) {
  if (!citations?.length) return <span>{text}</span>;

  // Build a set of labels for quick lookup
  const labelMap = {};
  citations.forEach((c) => { labelMap[c.label] = c; });

  // Replace [label] patterns with chips
  const parts = [];
  const pattern = /\[([^\]]+)\]/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const label = match[1];
    const cit = labelMap[label] || { label };
    parts.push(<CitationChip key={`${label}-${match.index}`} citation={cit} />);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return <span style={{ lineHeight: 1.8 }}>{parts}</span>;
}

export default function ChatMessage({ message }) {
  const { role, text, citations } = message;

  const wrapStyle = {
    ...S.wrap,
    ...(role === "user" ? S.userWrap : S.assistantWrap),
  };

  const bubbleStyle = {
    ...S.bubble,
    ...(role === "user"      ? S.userBubble :
        role === "error"     ? S.errorBubble :
                               S.assistantBubble),
  };

  return (
    <div style={wrapStyle}>
      <div style={bubbleStyle}>
        {role === "assistant"
          ? <AnswerText text={text} citations={citations} />
          : <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
        }

        {role === "assistant" && citations?.length > 0 && (
          <div style={S.citations}>
            {citations.map((c, i) => (
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
