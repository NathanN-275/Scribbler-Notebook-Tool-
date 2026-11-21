import { BookOpen } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Scribbler home">
      <span className="brand-mark"><BookOpen size={19} strokeWidth={2} /></span>
      <span>Scribbler<span className="brand-period">.</span></span>
    </Link>
  );
}
