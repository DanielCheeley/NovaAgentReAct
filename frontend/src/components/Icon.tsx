type IconProps = { name: "plus" | "chat" | "trash" | "arrow" | "stop" | "menu" | "code" | "idea" | "write"; size?: number };
const paths = {
  plus: "M12 5v14M5 12h14",
  chat: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  arrow: "M12 19V5m-6 6 6-6 6 6",
  stop: "M7 7h10v10H7Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 4l-4 16",
  idea: "M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2Z",
  write: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z",
};
export default function Icon({ name, size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
