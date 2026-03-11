const LOGO_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-orange-500', 'bg-pink-500',
];

export function bankInitials(bank: string): string {
  const words = bank.trim().split(/\s+/);
  if (words.length >= 3) return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  if (words.length === 2) return (words[0][0] + words[1][0] + (words[1][1] || '')).toUpperCase();
  return bank.slice(0, 3).toUpperCase();
}

export function bankColor(bank: string): string {
  let hash = 0;
  for (let i = 0; i < bank.length; i++) hash = (hash * 31 + bank.charCodeAt(i)) | 0;
  return LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length];
}

export function BankLogo({ bank, size = 40 }: { bank: string; size?: number }) {
  const initials = bankInitials(bank);
  const color = bankColor(bank);
  const fontSize = size <= 20 ? 'text-[7px]' : size <= 28 ? 'text-[9px]' : 'text-[11px]';
  return (
    <div
      className={`${color} rounded-xl flex items-center justify-center text-white font-bold ${fontSize} shrink-0`}
      style={{ width: size, height: size }}
      title={bank}
    >
      {initials}
    </div>
  );
}
