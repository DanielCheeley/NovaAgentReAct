const mark = `url("${import.meta.env.BASE_URL}nova-mark.svg")`;

export default function NovaMark({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 bg-current"
      style={{ width: size, height: size, mask: `${mark} center / contain no-repeat` }}
    />
  );
}
