const BASE = "/api";

export async function query(params) {
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadFiles(files) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getFiles() {
  const res = await fetch(`${BASE}/files`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Returns an EventSource-like stream; call onLog(line, level), onDone(code)
export function startIndexing({ tag } = {}, { onLog, onDone, onError }) {
  return fetch(`${BASE}/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.log)  onLog?.(ev.log, ev.level || "info");
            if (ev.done) onDone?.(ev.code);
            if (ev.error) onError?.(ev.error);
          } catch { /* skip malformed */ }
        }
      }
    };
    return pump();
  });
}
