import React from "react";

const S = {
  bar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },
  group: { display: "flex", flexDirection: "column", gap: "3px", minWidth: "120px" },
  label: { fontSize: "11px", fontWeight: 500, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" },
  input: {
    height: "30px",
    padding: "0 8px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: "13px",
    width: "100%",
  },
  select: {
    height: "30px",
    padding: "0 8px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: "13px",
    appearance: "none",
    cursor: "pointer",
    paddingRight: "24px",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239a9a96'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
  },
  clearBtn: {
    alignSelf: "flex-end",
    height: "30px",
    padding: "0 10px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-2)",
    fontSize: "12px",
    fontWeight: 500,
  },
};

export default function FilterBar({ filters, onChange }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });
  const clear = () => onChange({ filetype: "", file: "", since: "", tag: "" });
  const hasAny = Object.values(filters).some(Boolean);

  return (
    <div style={S.bar}>
      <div style={S.group}>
        <span style={S.label}>File type</span>
        <select style={S.select} value={filters.filetype} onChange={set("filetype")}>
          <option value="">All types</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="xlsx">XLSX</option>
          <option value="md">Markdown</option>
          <option value="txt">Text</option>
        </select>
      </div>

      <div style={S.group}>
        <span style={S.label}>File name</span>
        <input
          style={S.input}
          placeholder="e.g. invoice_q3.pdf"
          value={filters.file}
          onChange={set("file")}
        />
      </div>

      <div style={S.group}>
        <span style={S.label}>Indexed since</span>
        <input
          type="date"
          style={S.input}
          value={filters.since}
          onChange={set("since")}
        />
      </div>

      <div style={S.group}>
        <span style={S.label}>Tag</span>
        <input
          style={S.input}
          placeholder="e.g. finance"
          value={filters.tag}
          onChange={set("tag")}
        />
      </div>

      {hasAny && (
        <button style={S.clearBtn} onClick={clear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
