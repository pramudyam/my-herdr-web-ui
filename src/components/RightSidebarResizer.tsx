import { useRef, useState, type PointerEvent } from "react";
import "./RightSidebarResizer.css";

export interface RightSidebarResizerProps {
  onResize: (width: number) => void;
  onReset: () => void;
}

export function RightSidebarResizer({ onResize, onReset }: RightSidebarResizerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ right: number; grip: number; width: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const sidebar = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!sidebar) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      right: sidebar.right,
      grip: event.clientX - sidebar.left,
      width: Math.round(sidebar.width),
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state) return;
    const minW = 280;
    const maxW = Math.min(900, Math.round(window.innerWidth * 0.7));
    // Dragging left increases width: (state.right - event.clientX + state.grip)
    const rawW = state.right - (event.clientX - state.grip);
    const nextW = Math.max(minW, Math.min(maxW, Math.round(rawW)));
    if (nextW !== state.width) {
      state.width = nextW;
      state.moved = true;
      onResize(nextW);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={ref}
      className={`right-sidebar-resizer${dragging ? " is-dragging" : ""}`}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize right panel"
      title="Geser untuk mengatur lebar · Double-click untuk reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
    />
  );
}
