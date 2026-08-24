function dateInTimeZone(date = new Date(), timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function assertValidTimeZone(timeZone) {
  new Intl.DateTimeFormat('en-US', { timeZone }).format();
  return timeZone;
}

module.exports = { dateInTimeZone, assertValidTimeZone };
