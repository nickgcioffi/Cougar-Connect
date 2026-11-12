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
