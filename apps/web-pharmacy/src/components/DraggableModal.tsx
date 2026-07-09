'use client';
import { useRef, useState, useEffect, ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  initialWidth?: number;
  initialHeight?: number | 'auto';
  className?: string;
}

export default function DraggableModal({
  open, onClose, title, children,
  initialWidth = 560, initialHeight = 'auto', className = '',
}: Props) {
  const [pos, setPos]   = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight === 'auto' ? 0 : initialHeight });
  const [autoH, setAutoH] = useState(initialHeight === 'auto');
  const dragging  = useRef(false);
  const resizing  = useRef(false);
  const origin    = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });
  const boxRef    = useRef<HTMLDivElement>(null);

  // Center on first open
  useEffect(() => {
    if (!open) return;
    setPos({
      x: Math.max(0, (window.innerWidth  - initialWidth)  / 2),
      y: Math.max(0, (window.innerHeight - (initialHeight === 'auto' ? 500 : initialHeight)) / 2),
    });
    setSize({ w: initialWidth, h: initialHeight === 'auto' ? 0 : initialHeight });
    setAutoH(initialHeight === 'auto');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    dragging.current = true;
    origin.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y, w: size.w, h: size.h };
    e.preventDefault();
  };

  const startResize = (e: React.MouseEvent) => {
    resizing.current = true;
    const box = boxRef.current;
    origin.current = {
      mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y,
      w: box ? box.offsetWidth : size.w,
      h: box ? box.offsetHeight : size.h,
    };
    setAutoH(false);
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - origin.current.mx;
        const dy = e.clientY - origin.current.my;
        setPos({
          x: Math.max(0, Math.min(window.innerWidth  - 100, origin.current.x + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 40,  origin.current.y + dy)),
        });
      } else if (resizing.current) {
        const dx = e.clientX - origin.current.mx;
        const dy = e.clientY - origin.current.my;
        setSize({
          w: Math.max(320, origin.current.w + dx),
          h: Math.max(200, origin.current.h + dy),
        });
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className={`absolute bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden ${className}`}
        style={{
          left: pos.x, top: pos.y,
          width: size.w,
          ...(autoH ? { maxHeight: '90vh' } : { height: size.h }),
        }}
      >
        {/* Drag handle / title bar */}
        <div
          onMouseDown={startDrag}
          className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-100 cursor-move select-none shrink-0"
        >
          <div className="font-bold text-gray-800 text-sm">{title}</div>
          <button onMouseDown={e => e.stopPropagation()} onClick={onClose}
            className="no-drag p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className="absolute bottom-0 left-0 w-5 h-5 cursor-nwse-resize flex items-end justify-start p-1 opacity-30 hover:opacity-70"
          title="اسحب لتغيير الحجم"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-gray-500">
            <path d="M0 10L10 0M4 10L10 4M8 10L10 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
