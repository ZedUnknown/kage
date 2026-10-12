"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Pc = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  actionType: "lock" | "logout";
  graceSeconds: number;
  countdownSeconds: number;
  maxExtensions: number;
  maxExtendSeconds: number;
};
type Chair = { id: string; pcId: string | null; occupied: boolean | null; online: boolean };
type Action = {
  id: number;
  pcId: string;
  kind: "auto" | "forced";
  type: "lock" | "logout";
  warnAt: string;
  deadline: string;
  extensionsUsed: number;
};
type LogRow = { id: number; at: string; actor: string; event: string; pcId: string | null; detail: string | null };
type Overview = { pcs: Pc[]; chairs: Chair[]; pending: Action[]; log: LogRow[] };

type Tone = "seated" | "away" | "forced" | "offline";
type View = "floor" | "devices" | "activity";

const PC_SEEN_WINDOW_MS = 90_000;

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fmtRemaining(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Console() {
  const [data, setData] = useState<Overview | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View>("floor");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call("/api/admin/overview", "GET");
    if (r.status === 401) {
      setAuthed(false);
      return;
    }
    if (r.ok) {
      setData(r.data as Overview);
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  if (authed === null) return <main className="shell muted">Loading…</main>;
  if (!authed) return <Login onDone={load} />;
  if (!data) return <main className="shell muted">Loading…</main>;

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">KAGE</span>
        <nav className="tabs" aria-label="Sections">
          {(
            [
              ["floor", "Floor"],
              ["devices", "Devices"],
              ["activity", "Activity"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              className="tab"
              aria-current={view === v ? "page" : undefined}
              onClick={() => setView(v)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className="link"
          onClick={async () => {
            await call("/api/admin/login", "DELETE");
            setAuthed(false);
            setData(null);
          }}
        >
          Sign out
        </button>
      </header>

      {view === "floor" && (
        <Floor data={data} now={now} selected={selected} onSelect={setSelected} reload={load} />
      )}
      {view === "devices" && <Devices data={data} reload={load} />}
      {view === "activity" && <Activity log={data.log} />}
    </main>
  );
}

// ---- derived state -------------------------------------------------------

function describe(pc: Pc, data: Overview, now: number) {
  const chair = data.chairs.find((c) => c.pcId === pc.id);
  const forced = data.pending.find((a) => a.pcId === pc.id && a.kind === "forced");
  const auto = data.pending.find((a) => a.pcId === pc.id && a.kind === "auto");
  const seen = pc.lastSeenAt ? now - Date.parse(pc.lastSeenAt) < PC_SEEN_WINDOW_MS : false;

  let tone: Tone = "offline";
  let label = "";
  let count: string | null = null;
  let fraction: number | null = null;

  if (forced) {
    tone = "forced";
    label = forced.type === "lock" ? "Locking (admin)" : "Logging out (admin)";
  } else if (auto) {
    tone = "away";
    const warn = Date.parse(auto.warnAt);
    const dl = Date.parse(auto.deadline);
    if (now < warn) {
      label = "Left the seat";
    } else {
      label = auto.type === "lock" ? "Locks in" : "Logs out in";
      count = fmtRemaining(dl - now);
      fraction = Math.min(1, Math.max(0, (dl - now) / Math.max(1, dl - warn)));
    }
  } else if (!seen) {
    label = "PC not connected";
  } else if (!chair) {
    label = "No chair assigned";
  } else if (!chair.online) {
    label = "Chair sensor offline";
  } else if (chair.occupied) {
    tone = "seated";
    label = "Seated";
  } else {
    tone = "away";
    label = "Seat empty";
  }
  return { chair, tone, label, count, fraction, seen };
}

// ---- floor ---------------------------------------------------------------

function Floor(props: {
  data: Overview;
  now: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  reload: () => void;
}) {
  const { data, now, selected, onSelect, reload } = props;
  const rows = useMemo(
    () => data.pcs.map((pc) => ({ pc, ...describe(pc, data, now) })),
    [data, now],
  );
  const n = (t: Tone) => rows.filter((r) => r.tone === t).length;

  if (data.pcs.length === 0) {
    return (
      <div className="panel" style={{ marginTop: 20 }}>
        <h2>No workstations yet</h2>
        <p className="muted">Add your first PC and chair under Devices.</p>
      </div>
    );
  }

  const sel = rows.find((r) => r.pc.id === selected);

  return (
    <>
      <p className="summary">
        <b>{n("seated")}</b> seated, <b>{n("away")}</b> away, <b>{n("forced")}</b> forced,{" "}
        <b>{n("offline")}</b> offline
      </p>
      <div className="floor">
        <div className="grid">
          {rows.map((r) => (
            <button
              key={r.pc.id}
              className="tile"
              data-state={r.tone}
              aria-pressed={selected === r.pc.id}
              onClick={() => onSelect(selected === r.pc.id ? null : r.pc.id)}
            >
              <span>
                <span className="name">{r.pc.name}</span>
                <br />
                <span className="state">{r.label}</span>
              </span>
              {r.count && <span className="count">{r.count}</span>}
              {r.fraction !== null && (
                <span className="drain" aria-hidden>
                  <i style={{ width: `${r.fraction * 100}%` }} />
                </span>
              )}
            </button>
          ))}
        </div>
        {sel ? (
          <Detail key={sel.pc.id} row={sel} reload={reload} />
        ) : (
          <aside className="panel">
            <h2>Select a workstation</h2>
            <p className="muted">Choose a tile to lock or log out a PC, or change its rules.</p>
          </aside>
        )}
      </div>
    </>
  );
}

function Detail({
  row,
  reload,
}: {
  row: { pc: Pc; chair?: Chair; tone: Tone; label: string; count: string | null };
  reload: () => void;
}) {
  const { pc, chair, tone, label, count } = row;
  const [confirm, setConfirm] = useState<"lock" | "logout" | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [p, setP] = useState({
    actionType: pc.actionType,
    graceSeconds: pc.graceSeconds,
    countdownSeconds: pc.countdownSeconds,
    maxExtensions: pc.maxExtensions,
    maxExtendMinutes: Math.round(pc.maxExtendSeconds / 60),
  });

  async function force(type: "lock" | "logout") {
    const r = await call("/api/admin/force", "POST", { op: "force", pcId: pc.id, type });
    setConfirm(null);
    setMsg(
      r.ok
        ? { text: r.data.result === "already_forced" ? "An admin action is already running." : "Command sent." }
        : { text: "Could not send the command.", error: true },
    );
    reload();
  }

  async function cancelForced() {
    await call("/api/admin/force", "POST", { op: "cancel", pcId: pc.id });
    setMsg({ text: "Admin action cancelled." });
    reload();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const r = await call("/api/admin/devices", "POST", {
      op: "policy",
      pcId: pc.id,
      actionType: p.actionType,
      graceSeconds: p.graceSeconds,
      countdownSeconds: p.countdownSeconds,
      maxExtensions: p.maxExtensions,
      maxExtendSeconds: p.maxExtendMinutes * 60,
    });
    setMsg(r.ok ? { text: "Rules saved." } : { text: "Rules were not saved. Check the values.", error: true });
    reload();
  }

  const num = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP({ ...p, [k]: Number(e.target.value) });

  return (
    <aside className="panel stack">
      <div>
        <h2>{pc.name}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {label}
          {count ? ` ${count}` : ""}. Chair {chair ? chair.id : "not assigned"}.
        </p>
      </div>

      <div className="row">
        {confirm ? (
          <>
            <button className="btn danger" onClick={() => force(confirm)}>
              Confirm {confirm === "lock" ? "lock" : "log out"}
            </button>
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              Keep working
            </button>
          </>
        ) : tone === "forced" ? (
          <button className="btn ghost" onClick={cancelForced}>
            Cancel admin action
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => setConfirm("lock")}>
              Lock now
            </button>
            <button className="btn ghost" onClick={() => setConfirm("logout")}>
              Log out now
            </button>
          </>
        )}
      </div>

      {msg && (
        <div className={msg.error ? "note error" : "note"} role="status">
          {msg.text}
        </div>
      )}

      <form className="stack" onSubmit={save}>
        <h3>Rules for this PC</h3>
        <div className="form-grid">
          <label className="field">
            When the seat is empty
            <select value={p.actionType} onChange={(e) => setP({ ...p, actionType: e.target.value as "lock" | "logout" })}>
              <option value="lock">Lock the PC</option>
              <option value="logout">Log the user out</option>
            </select>
          </label>
          <label className="field">
            Wait before warning (seconds)
            <input type="number" min={0} max={600} value={p.graceSeconds} onChange={num("graceSeconds")} />
          </label>
          <label className="field">
            Countdown (seconds)
            <input type="number" min={5} max={3600} value={p.countdownSeconds} onChange={num("countdownSeconds")} />
          </label>
          <label className="field">
            Extensions allowed
            <input type="number" min={0} max={20} value={p.maxExtensions} onChange={num("maxExtensions")} />
          </label>
          <label className="field">
            Total extra time (minutes)
            <input type="number" min={0} max={1440} value={p.maxExtendMinutes} onChange={num("maxExtendMinutes")} />
          </label>
        </div>
        <div>
          <button className="btn" type="submit">
            Save rules
          </button>
        </div>
      </form>
    </aside>
  );
}

// ---- devices -------------------------------------------------------------

function Devices({ data, reload }: { data: Overview; reload: () => void }) {
  const [token, setToken] = useState<{ pc: string; token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pcForm, setPcForm] = useState({ id: "", name: "" });
  const [chairForm, setChairForm] = useState({ id: "", pcId: "" });

  async function addPc(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const r = await call("/api/admin/devices", "POST", { op: "register_pc", ...pcForm });
    if (!r.ok) return setErr("Could not add the PC. Enter an ID and a name.");
    setToken({ pc: r.data.pcId, token: r.data.token });
    setPcForm({ id: "", name: "" });
    reload();
  }

  async function assign(id: string, pcId: string | null) {
    setErr(null);
    const r = await call("/api/admin/devices", "POST", { op: "upsert_chair", id, pcId });
    if (!r.ok) setErr("Could not save the chair. Enter a chair ID.");
    reload();
  }

  async function addChair(e: FormEvent) {
    e.preventDefault();
    await assign(chairForm.id, chairForm.pcId || null);
    setChairForm({ id: "", pcId: "" });
  }

  return (
    <div className="stack" style={{ marginTop: 20 }}>
      {err && (
        <div className="note error" role="alert">
          {err}
        </div>
      )}

      <section className="panel stack">
        <h2>Workstations</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Last contact</th>
              </tr>
            </thead>
            <tbody>
              {data.pcs.map((pc) => (
                <tr key={pc.id}>
                  <td>{pc.name}</td>
                  <td>{pc.id}</td>
                  <td>{pc.lastSeenAt ? new Date(pc.lastSeenAt).toLocaleString() : "Never"}</td>
                </tr>
              ))}
              {data.pcs.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No PCs yet. Add one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form className="form-grid" onSubmit={addPc}>
          <label className="field">
            PC ID
            <input required value={pcForm.id} onChange={(e) => setPcForm({ ...pcForm, id: e.target.value.trim() })} />
          </label>
          <label className="field">
            Display name
            <input required value={pcForm.name} onChange={(e) => setPcForm({ ...pcForm, name: e.target.value })} />
          </label>
          <div style={{ alignSelf: "end" }}>
            <button className="btn" type="submit">
              Add PC
            </button>
          </div>
        </form>
        <p className="muted" style={{ margin: 0 }}>
          Adding a PC that already exists creates a new access token and stops the old one from working.
        </p>
        {token && (
          <div className="note" role="status">
            Token for {token.pc}: <b>{token.token}</b>
            <br />
            Copy it into that PC now. It is not shown again.
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2>Chairs</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Chair</th>
                <th>Sensor</th>
                <th>Seat</th>
                <th>Workstation</th>
              </tr>
            </thead>
            <tbody>
              {data.chairs.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>
                    <span className={c.online ? "dot on" : "dot"} />
                    {c.online ? "Online" : "Offline"}
                  </td>
                  <td>{c.occupied === null ? "No reading" : c.occupied ? "Occupied" : "Empty"}</td>
                  <td>
                    <select
                      aria-label={`Workstation for chair ${c.id}`}
                      value={c.pcId ?? ""}
                      onChange={(e) => assign(c.id, e.target.value || null)}
                    >
                      <option value="">Not assigned</option>
                      {data.pcs.map((pc) => (
                        <option key={pc.id} value={pc.id}>
                          {pc.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {data.chairs.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No chairs yet. Add one below using the ID flashed on its sensor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form className="form-grid" onSubmit={addChair}>
          <label className="field">
            Chair ID
            <input required value={chairForm.id} onChange={(e) => setChairForm({ ...chairForm, id: e.target.value.trim() })} />
          </label>
          <label className="field">
            Workstation
            <select value={chairForm.pcId} onChange={(e) => setChairForm({ ...chairForm, pcId: e.target.value })}>
              <option value="">Not assigned</option>
              {data.pcs.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ alignSelf: "end" }}>
            <button className="btn" type="submit">
              Add chair
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ---- activity ------------------------------------------------------------

const EVENT_TEXT: Record<string, string> = {
  auto_action_created: "Seat left, countdown started",
  auto_action_cancelled: "Returned to seat, countdown cancelled",
  extension_granted: "Extra time granted",
  extension_refused: "Extra time refused",
  force_action: "Admin forced an action",
  force_cancelled: "Admin cancelled a forced action",
};

function Activity({ log }: { log: LogRow[] }) {
  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <h2>Recent activity</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>What happened</th>
              <th>PC</th>
              <th>By</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.at).toLocaleTimeString()}</td>
                <td>{EVENT_TEXT[l.event] ?? l.event}</td>
                <td>{l.pcId ?? ""}</td>
                <td>{l.actor}</td>
                <td>{l.detail ?? ""}</td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Nothing has happened yet. Events appear when someone leaves or returns to a seat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- login ---------------------------------------------------------------

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await call("/api/admin/login", "POST", { password: pw });
    if (r.ok) onDone();
    else setErr(true);
  }

  return (
    <main className="shell">
      <form className="panel stack login" onSubmit={submit}>
        <h1>KAGE</h1>
        <p className="muted" style={{ margin: 0 }}>
          Sign in to manage lab workstations.
        </p>
        <label className="field">
          Admin password
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && (
          <div className="note error" role="alert">
            That password is not correct.
          </div>
        )}
        <button className="btn" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}
