const toValidDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const isoDate = (d) => {
  const dd = toValidDate(d);
  if (!dd) return '';
  return dd.toISOString().split('T')[0];
};

export const makeAppointmentKey = (evt) => {
  if (!evt) return '';
  const patientId = String(evt?.patientId ?? evt?.id ?? '').trim();
  const date = isoDate(evt?.originalDate ?? evt?.date);
  const time = String(evt?.time || '').trim();
  if (!patientId || !date) return '';
  return `${patientId}_${date}_${time}`;
};
