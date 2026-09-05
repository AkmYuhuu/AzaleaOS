import { useId, useState, useRef } from "react";
import "./Tooltip.css";

type Props = {
  content: string;
  children: React.ReactElement;
  delay?: number;
};

export default function Tooltip({ content, children, delay = 400 }: Props): JSX.Element {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const show = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(true), delay) as unknown as number;
  };
  const hide = () => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setVisible(false);
  };

  const child = children as React.ReactElement<any>;
  const existingProps: any = child.props;
  return (
    <span className="tooltipWrap" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {/*
       honey: clone with aria-describedby when tooltip visible; keeps icon-only controls accessible without new DOM nesting issues
      */}
      <span aria-describedby={visible ? id : undefined} style={{ display: "inline-flex" }}>
        {child}
      </span>
      {visible && (
        <span id={id} role="tooltip" className="tooltipBubble">
          {content}
        </span>
      )}
    </span>
  );
}
