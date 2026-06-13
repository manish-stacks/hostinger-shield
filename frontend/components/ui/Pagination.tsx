'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, limit, onChange }: Props) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Build page numbers: always show first, last, current ±2, with ellipsis
  const nums: (number | '...')[] = [];
  const add = (n: number) => { if (!nums.includes(n)) nums.push(n); };

  add(1);
  if (page > 4) nums.push('...');
  for (let i = Math.max(2, page - 2); i <= Math.min(pages - 1, page + 2); i++) add(i);
  if (page < pages - 3) nums.push('...');
  if (pages > 1) add(pages);

  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#21262d]">
      <p className="text-xs text-[#8b949e]">
        Showing <span className="text-[#e6edf3] font-medium">{from}–{to}</span> of{' '}
        <span className="text-[#e6edf3] font-medium">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="btn-secondary py-1 px-2 text-xs disabled:opacity-40"
        >
          <ChevronLeft size={14} />
        </button>

        {nums.map((n, i) =>
          n === '...' ? (
            <span key={`e${i}`} className="px-2 text-xs text-[#8b949e]">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n as number)}
              className={`py-1 px-2.5 rounded text-xs font-medium transition-all ${
                n === page
                  ? 'bg-[#3b5bdb] text-white'
                  : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]'
              }`}
            >
              {n}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === pages}
          className="btn-secondary py-1 px-2 text-xs disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}