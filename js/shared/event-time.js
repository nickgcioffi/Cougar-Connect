// Event form dates and times represent campus time, regardless of the viewer's zone.
export function eventTimestamp(date, time) {
  const wallTime = Date.parse(`${date}T${time}Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    timeZoneName: "longOffset",
  });
  let instant = wallTime;
  for (let attempt = 0; attempt < 3; attempt++) {
    const zone = formatter
      .formatToParts(new Date(instant))
      .find((part) => part.type === "timeZoneName").value;
    const [, sign, hours, minutes] = zone.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offset =
      (Number(hours) * 60 + Number(minutes)) * (sign === "+" ? 1 : -1);
    const next = wallTime - offset * 60_000;
    if (next === instant) return new Date(instant);
    instant = next;
  }
  throw new Error(
    "This campus time does not exist during the daylight-saving transition.",
  );
}

export function campusDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type) =>
    parts.find((part) => part.type === type).value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function eventEndTimestamp(event) {
  // Without an end time, the event lasts through its Utah calendar day.
  if (!event.endTime) {
    const nextDate = new Date(`${event.date}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    return eventTimestamp(
      nextDate.toISOString().slice(0, 10),
      "00:00:00",
    );
  }

  let date = event.endDate || event.date;

  // An earlier end time means the event continues past midnight.
  if (!event.endDate && event.time && event.endTime < event.time) {
    const nextDate = new Date(`${date}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    date = nextDate.toISOString().slice(0, 10);
  }

  return eventTimestamp(date, event.endTime);
}

export function hasEventEnded(event, now = new Date()) {
  try {
    return eventEndTimestamp(event).getTime() <= now.getTime();
  } catch {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(event.date) &&
      event.date < campusDate(now)
    );
  }
}

export function compareEventStarts(a, b) {
  return `${a.date}T${a.time || "00:00:00"}`.localeCompare(
    `${b.date}T${b.time || "00:00:00"}`,
  );
}
