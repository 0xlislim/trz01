const BASE = "https://transport.zone01oujda.ma/api";

const headers = (token) => ({
  Cookie: `__Secure-elgencia.session_token=${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
});

export const listReservations = async (token) => {
  const resp = await fetch(`${BASE}/buses/reservations`, {
    headers: headers(token),
  });
  if (!resp.ok) throw new Error(`list reservations failed (${resp.status})`);
  const body = await resp.json();
  return body.res || [];
};

export const cancelReservation = async (token, reservation) => {
  const resp = await fetch(`${BASE}/buses/reservations`, {
    method: "DELETE",
    headers: headers(token),
    body: JSON.stringify(reservation),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await resp.json());
    } catch {
      detail = await resp.text();
    }
    throw new Error(`cancel reservation failed (${resp.status}): ${detail}`);
  }
  return resp.status;
};

export const formatReservation = (r) => {
  const date = new Date(r.bus?.date);
  const local = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return {
    id: r.id,
    time: local,
    from: r.bus?.busFrom ?? r.bus?.schedule?.departure,
    to: r.bus?.busTo ?? r.bus?.schedule?.destination,
    seatNo: r.seatNo,
    date: date.toLocaleDateString(),
  };
};