const USER_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function PaidByBadge({
  name,
  userId,
}: {
  name: string;
  userId: string;
}) {
  const colorIndex = hashCode(userId) % USER_COLORS.length;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${USER_COLORS[colorIndex]}`}
    >
      {name}
    </span>
  );
}
