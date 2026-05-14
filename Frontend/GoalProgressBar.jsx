/**
 * GoalProgressBar.jsx
 * ─────────────────────────────────────────────────────────────
 * Component hiển thị thanh tiến độ milestone cho một mục tiêu.
 *
 * Props:
 *   milestones  {Array}  – Danh sách milestone: [{ task, isDone, proof }]
 *   goalTitle   {string} – Tiêu đề mục tiêu (tuỳ chọn, dùng trong demo)
 *   animated    {bool}   – Bật/tắt animation (default: true)
 *
 * Yêu cầu: React 18+, Tailwind CSS v3+
 * ─────────────────────────────────────────────────────────────
 */

import React, { useMemo, useEffect, useRef, useState } from 'react';

// ── Helper: tính màu theo % ─────────────────────────────────
function getColorConfig(percent) {
    if (percent < 30) {
        return {
            bar:    'from-red-500 to-rose-400',
            glow:   'shadow-red-400/40',
            text:   'text-red-500',
            bg:     'bg-red-50',
            border: 'border-red-200',
            dot:    'bg-red-500',
            label:  'Hãy bắt đầu nào!',
            emoji:  '🔥',
        };
    }
    if (percent < 50) {
        return {
            bar:    'from-orange-400 to-amber-400',
            glow:   'shadow-amber-400/40',
            text:   'text-amber-600',
            bg:     'bg-amber-50',
            border: 'border-amber-200',
            dot:    'bg-amber-500',
            label:  'Đang nỗ lực',
            emoji:  '💪',
        };
    }
    if (percent < 70) {
        return {
            bar:    'from-yellow-400 to-lime-400',
            glow:   'shadow-yellow-400/40',
            text:   'text-yellow-600',
            bg:     'bg-yellow-50',
            border: 'border-yellow-200',
            dot:    'bg-yellow-500',
            label:  'Giữa chặng đường',
            emoji:  '⚡',
        };
    }
    if (percent < 90) {
        return {
            bar:    'from-lime-400 to-emerald-500',
            glow:   'shadow-emerald-400/40',
            text:   'text-emerald-600',
            bg:     'bg-emerald-50',
            border: 'border-emerald-200',
            dot:    'bg-emerald-500',
            label:  'Sắp về đích!',
            emoji:  '🚀',
        };
    }
    return {
        bar:    'from-emerald-400 to-teal-400',
        glow:   'shadow-emerald-400/50',
        text:   'text-teal-600',
        bg:     'bg-teal-50',
        border: 'border-teal-200',
        dot:    'bg-teal-500',
        label:  'Hoàn thành xuất sắc!',
        emoji:  '🎉',
    };
}

// ── Sub-component: MilestoneDot ─────────────────────────────
function MilestoneDot({ milestone, index, total, percent, colors }) {
    // Vị trí % trên thanh bar của milestone này
    const position = total === 1 ? 100 : (index / (total - 1)) * 100;
    const isReached = percent >= position;
    const isCurrent = !milestone.isDone && isReached;

    return (
        <div
            className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
            style={{ left: `${position}%`, transform: 'translate(-50%, -50%)' }}
        >
            {/* Dot */}
            <div
                className={`
                    w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm
                    transition-all duration-500 ease-out
                    ${milestone.isDone
                        ? `${colors.dot} scale-110`
                        : isReached
                            ? `${colors.dot} opacity-60 animate-pulse`
                            : 'bg-gray-200'
                    }
                `}
            />
            {/* Tooltip khi hover */}
            <div className="
                absolute bottom-full mb-2 px-2 py-1 rounded-lg text-xs whitespace-nowrap
                bg-gray-800 text-white opacity-0 group-hover:opacity-100
                pointer-events-none transition-opacity duration-200 z-10
                -translate-x-1/2 left-1/2
            ">
                {milestone.task}
                {milestone.isDone && ' ✓'}
            </div>
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────
export default function GoalProgressBar({
    milestones = [],
    goalTitle  = '',
    animated   = true,
}) {
    const [displayPercent, setDisplayPercent] = useState(0);
    const [isVisible, setIsVisible]           = useState(false);
    const barRef = useRef(null);

    // Tính % thực tế dựa trên milestones
    const truePercent = useMemo(() => {
        if (!milestones || milestones.length === 0) return 0;
        const done = milestones.filter(m => m.isDone).length;
        return Math.round((done / milestones.length) * 100);
    }, [milestones]);

    const doneCount  = milestones.filter(m => m.isDone).length;
    const totalCount = milestones.length;
    const colors     = getColorConfig(truePercent);

    // Intersection Observer → kích hoạt animation khi vào viewport
    useEffect(() => {
        if (!animated) {
            setIsVisible(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
            { threshold: 0.3 }
        );
        if (barRef.current) observer.observe(barRef.current);
        return () => observer.disconnect();
    }, [animated]);

    // Animate số đếm khi isVisible
    useEffect(() => {
        if (!isVisible) return;
        if (!animated) { setDisplayPercent(truePercent); return; }

        let start = 0;
        const duration = 900; // ms
        const step = 16;      // ~60fps
        const increment = truePercent / (duration / step);

        const timer = setInterval(() => {
            start += increment;
            if (start >= truePercent) {
                setDisplayPercent(truePercent);
                clearInterval(timer);
            } else {
                setDisplayPercent(Math.floor(start));
            }
        }, step);

        return () => clearInterval(timer);
    }, [isVisible, truePercent, animated]);

    // Trường hợp không có milestone
    if (totalCount === 0) {
        return (
            <div className="flex items-center gap-2 py-3 px-4 rounded-xl bg-gray-50 border border-gray-200">
                <span className="text-gray-400 text-sm">Chưa có milestone nào</span>
            </div>
        );
    }

    return (
        <div ref={barRef} className="w-full select-none">

            {/* ── Header: tiêu đề + badge trạng thái ── */}
            <div className="flex items-center justify-between mb-3">
                {goalTitle && (
                    <p className="text-sm font-semibold text-gray-700 truncate max-w-[60%]">
                        {goalTitle}
                    </p>
                )}
                <div className={`
                    ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
                    border ${colors.bg} ${colors.border} ${colors.text}
                    transition-all duration-500
                `}>
                    <span>{colors.emoji}</span>
                    <span>{colors.label}</span>
                </div>
            </div>

            {/* ── Thanh progress bar chính ── */}
            <div className="relative group">
                {/* Track (nền xám) */}
                <div className="h-4 w-full rounded-full bg-gray-100 border border-gray-200 overflow-visible relative">

                    {/* Fill (gradient màu theo %) */}
                    <div
                        className={`
                            h-full rounded-full bg-gradient-to-r ${colors.bar}
                            shadow-lg ${colors.glow}
                            transition-all duration-700 ease-out
                            relative overflow-hidden
                        `}
                        style={{ width: isVisible ? `${truePercent}%` : '0%' }}
                    >
                        {/* Shimmer sweep effect */}
                        <div className="
                            absolute inset-0
                            bg-gradient-to-r from-transparent via-white/30 to-transparent
                            translate-x-[-100%] animate-[shimmer_2s_ease-in-out_infinite]
                        " />
                    </div>

                    {/* Milestone dots (hiển thị trên thanh) */}
                    {milestones.map((ms, i) => (
                        <MilestoneDot
                            key={ms._id || i}
                            milestone={ms}
                            index={i}
                            total={totalCount}
                            percent={truePercent}
                            colors={colors}
                        />
                    ))}
                </div>

                {/* Tooltip tổng quát (hiện khi hover bar) */}
                <div className="
                    absolute -top-8 left-1/2 -translate-x-1/2
                    px-2.5 py-1 bg-gray-800 text-white text-xs rounded-lg
                    opacity-0 group-hover:opacity-100 transition-opacity duration-200
                    pointer-events-none whitespace-nowrap z-10
                ">
                    {doneCount}/{totalCount} milestone đã hoàn thành
                </div>
            </div>

            {/* ── Footer: số đếm + milestone list ── */}
            <div className="flex items-center justify-between mt-2.5">
                {/* Số % với animation count-up */}
                <div className={`flex items-baseline gap-1 ${colors.text}`}>
                    <span className="text-2xl font-black tabular-nums leading-none transition-all duration-300">
                        {displayPercent}
                    </span>
                    <span className="text-sm font-bold">%</span>
                </div>

                {/* Số milestone */}
                <span className="text-xs text-gray-400 font-medium">
                    {doneCount} / {totalCount} bước
                </span>
            </div>

            {/* ── Danh sách milestone dạng chip ── */}
            <div className="flex flex-wrap gap-1.5 mt-3">
                {milestones.map((ms, i) => (
                    <div
                        key={ms._id || i}
                        className={`
                            flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
                            border transition-all duration-300
                            ${ms.isDone
                                ? `${colors.bg} ${colors.border} ${colors.text} font-semibold`
                                : 'bg-gray-50 border-gray-200 text-gray-400'
                            }
                        `}
                    >
                        {/* Icon check / circle */}
                        {ms.isDone ? (
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 12 12">
                                <circle cx="6" cy="6" r="5.5" className={`fill-current ${colors.text} opacity-20`}/>
                                <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="1.5"
                                      strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        ) : (
                            <span className="w-3 h-3 flex-shrink-0 rounded-full border border-gray-300 inline-block"/>
                        )}
                        <span className="truncate max-w-[120px]">{ms.task}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── CSS for shimmer (thêm vào tailwind.config.js nếu cần) ───
/*
  theme: {
    extend: {
      keyframes: {
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s ease-in-out infinite',
      },
    },
  },
*/
