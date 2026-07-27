const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getOrdinalSuffix(day: number) {
  const teenRemainder = day % 100;
  if (teenRemainder >= 11 && teenRemainder <= 13) return "th";

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function formatReleaseDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate).trim());
  if (!match) return isoDate;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const month = MONTH_NAMES[monthIndex];
  if (!Number.isSafeInteger(year) || !month || day < 1 || day > 31) return isoDate;

  return `${day}${getOrdinalSuffix(day)} ${month} ${year}`;
}
